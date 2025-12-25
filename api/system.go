package api

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/earentir/cpuid"
	"github.com/earentir/gosmbios"
	"github.com/earentir/gosmbios/types/type0"
	"github.com/earentir/gosmbios/types/type1"
	"github.com/earentir/gosmbios/types/type17"
	"github.com/earentir/gosmbios/types/type2"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/mem"
)

// GetSystemMetrics returns current system metrics (CPU, RAM, Disk).
func GetSystemMetrics(ctx context.Context) SystemMetrics {
	var metrics SystemMetrics

	// CPU metrics
	percentages, err := cpu.PercentWithContext(ctx, time.Second, false)
	if err != nil {
		metrics.CPU.Error = err.Error()
	} else if len(percentages) > 0 {
		metrics.CPU.Usage = percentages[0]
	}

	// RAM metrics
	vm, err := mem.VirtualMemoryWithContext(ctx)
	if err != nil {
		metrics.RAM.Error = err.Error()
	} else {
		metrics.RAM.Total = vm.Total
		metrics.RAM.Used = vm.Used
		metrics.RAM.Available = vm.Available
		metrics.RAM.Percent = vm.UsedPercent
	}

	// Disk metrics (root filesystem)
	usage, err := disk.UsageWithContext(ctx, "/")
	if err != nil {
		metrics.Disk.Error = err.Error()
	} else {
		metrics.Disk.Total = usage.Total
		metrics.Disk.Used = usage.Used
		metrics.Disk.Free = usage.Free
		metrics.Disk.Percent = usage.UsedPercent
	}

	return metrics
}

// GetCPUDetails returns detailed CPU information from CPUID.
func GetCPUDetails(_ context.Context) CPUDetailsInfo {
	var info CPUDetailsInfo

	vendorID := cpuid.GetVendorID(false, "")
	maxFunc, maxExtFunc := cpuid.GetMaxFunctions(false, "")

	info.Vendor = cpuid.GetVendorName(false, "")

	brand := cpuid.GetBrandString(maxExtFunc, false, "")
	if brand != "" {
		info.Name = strings.TrimSpace(brand)
	} else {
		info.Name = "Unknown CPU"
	}

	procInfo := cpuid.GetProcessorInfo(maxFunc, maxExtFunc, false, "")
	info.VirtualCores = int(procInfo.CoreCount)
	if procInfo.ThreadPerCore > 1 {
		info.PhysicalCores = int(procInfo.CoreCount) / int(procInfo.ThreadPerCore)
	} else {
		info.PhysicalCores = int(procInfo.CoreCount)
	}

	modelData := cpuid.GetModelData(false, "")
	info.Family = int(modelData.ExtendedFamily)
	info.Model = int(modelData.ExtendedModel)
	info.Stepping = int(modelData.SteppingID)

	caches, err := cpuid.GetCacheInfo(maxFunc, maxExtFunc, vendorID, false, "")
	if err == nil {
		for _, cache := range caches {
			if cache.Level >= 1 && cache.Level <= 3 {
				cacheInfo := CPUCacheInfo{
					Level:  int(cache.Level),
					Type:   cache.Type,
					SizeKB: int(cache.SizeKB),
				}
				info.Cache = append(info.Cache, cacheInfo)
			}
		}
	}

	categories := cpuid.GetAllFeatureCategories()
	for _, cat := range categories {
		features := cpuid.GetSupportedFeatures(cat, false, "")
		info.Features = append(info.Features, features...)
	}

	hybridInfo := cpuid.GetIntelHybrid(false, "")
	if hybridInfo.HybridCPU {
		info.HybridCPU = true
		info.CoreType = hybridInfo.CoreTypeName
	}

	return info
}

// GetSMBIOSRAMInfo returns RAM module information from SMBIOS.
func GetSMBIOSRAMInfo(_ context.Context) SMBIOSRAMInfo {
	var info SMBIOSRAMInfo

	sm, err := gosmbios.Read()
	if err != nil {
		info.Error = "Failed to read SMBIOS: " + err.Error()
		return info
	}

	memoryDevices, err := type17.GetPopulated(sm)
	if err != nil {
		info.Error = "Failed to get memory devices: " + err.Error()
		return info
	}

	if len(memoryDevices) == 0 {
		info.Error = "No memory devices found"
		return info
	}

	var totalSizeMB uint64
	var modules []RAMModuleInfo
	manufacturers := make(map[string]bool)

	for _, dev := range memoryDevices {
		module := RAMModuleInfo{
			DeviceLocator: dev.DeviceLocator,
			BankLocator:   dev.BankLocator,
			Size:          dev.Size,
			SizeString:    dev.SizeString(),
		}

		if dev.Manufacturer != "" {
			module.Manufacturer = dev.Manufacturer
			manufacturers[dev.Manufacturer] = true
		}

		if dev.PartNumber != "" {
			module.PartNumber = dev.PartNumber
		}

		if dev.SerialNumber != "" {
			module.SerialNumber = dev.SerialNumber
		}

		if dev.Speed > 0 {
			module.Speed = dev.Speed
			module.SpeedString = fmt.Sprintf("%d MHz", dev.Speed)
		}

		if dev.MemoryType > 0 {
			module.Type = dev.MemoryType.String()
		}

		if dev.FormFactor > 0 {
			module.FormFactor = dev.FormFactor.String()
		}

		if dev.ConfiguredVoltage > 0 {
			module.Voltage = dev.ConfiguredVoltage
			voltageV := float64(dev.ConfiguredVoltage) / 1000.0
			module.VoltageString = fmt.Sprintf("%.3f V", voltageV)
		}

		modules = append(modules, module)
		totalSizeMB += dev.Size
	}

	info.Modules = modules
	info.TotalSize = totalSizeMB

	if totalSizeMB >= 1024 {
		info.TotalSizeString = fmt.Sprintf("%.1f GB", float64(totalSizeMB)/1024.0)
	} else {
		info.TotalSizeString = fmt.Sprintf("%d MB", totalSizeMB)
	}

	if len(manufacturers) == 1 {
		for mfr := range manufacturers {
			info.Manufacturer = mfr
		}
	} else if len(manufacturers) > 1 {
		var mfrList []string
		for mfr := range manufacturers {
			mfrList = append(mfrList, mfr)
		}
		info.Manufacturer = strings.Join(mfrList, ", ")
	}

	return info
}

// GetSMBIOSFirmwareInfo returns BIOS/firmware information from SMBIOS.
func GetSMBIOSFirmwareInfo(_ context.Context) SMBIOSFirmwareInfo {
	var info SMBIOSFirmwareInfo

	sm, err := gosmbios.Read()
	if err != nil {
		info.Error = "Failed to read SMBIOS: " + err.Error()
		return info
	}

	biosInfo, err := type0.Get(sm)
	if err != nil {
		info.Error = "Failed to get BIOS information: " + err.Error()
		return info
	}

	if biosInfo.Vendor != "" {
		info.Vendor = biosInfo.Vendor
	}

	if biosInfo.Version != "" {
		info.Version = biosInfo.Version
	}

	if biosInfo.ReleaseDate != "" {
		info.ReleaseDate = biosInfo.ReleaseDate
	}

	return info
}

// GetSMBIOSSystemInfo returns system information from SMBIOS.
func GetSMBIOSSystemInfo(_ context.Context) SMBIOSSystemInfo {
	var info SMBIOSSystemInfo

	sm, err := gosmbios.Read()
	if err != nil {
		info.Error = "Failed to read SMBIOS: " + err.Error()
		return info
	}

	systemInfo, err := type1.Get(sm)
	if err != nil {
		info.Error = "Failed to get System information: " + err.Error()
		return info
	}

	if systemInfo.Manufacturer != "" {
		info.Manufacturer = systemInfo.Manufacturer
	}

	if systemInfo.ProductName != "" {
		info.ProductName = systemInfo.ProductName
	}

	if systemInfo.Version != "" {
		info.Version = systemInfo.Version
	}

	if systemInfo.SerialNumber != "" {
		info.SerialNumber = systemInfo.SerialNumber
	}

	if systemInfo.UUID != (type1.UUID{}) {
		uuid := systemInfo.UUID
		if len(uuid) >= 16 {
			info.UUID = fmt.Sprintf("%02X%02X%02X%02X-%02X%02X-%02X%02X-%02X%02X-%02X%02X%02X%02X%02X%02X",
				uuid[0], uuid[1], uuid[2], uuid[3],
				uuid[4], uuid[5],
				uuid[6], uuid[7],
				uuid[8], uuid[9],
				uuid[10], uuid[11], uuid[12], uuid[13], uuid[14], uuid[15])
		} else if len(uuid) > 0 {
			var parts []string
			for i := 0; i < len(uuid); i++ {
				parts = append(parts, fmt.Sprintf("%02X", uuid[i]))
			}
			info.UUID = strings.Join(parts, "-")
		}
	}

	if systemInfo.WakeUpType > 0 {
		info.WakeUpType = systemInfo.WakeUpType.String()
	}

	if systemInfo.SKUNumber != "" {
		info.SKUNumber = systemInfo.SKUNumber
	}

	if systemInfo.Family != "" {
		info.Family = systemInfo.Family
	}

	return info
}

// GetSMBIOSBaseboardInfo returns baseboard information from SMBIOS.
func GetSMBIOSBaseboardInfo(_ context.Context) SMBIOSBaseboardInfo {
	var info SMBIOSBaseboardInfo

	sm, err := gosmbios.Read()
	if err != nil {
		info.Error = "Failed to read SMBIOS: " + err.Error()
		return info
	}

	baseboardInfo, err := type2.Get(sm)
	if err != nil {
		info.Error = "Failed to get Baseboard information: " + err.Error()
		return info
	}

	if baseboardInfo.Manufacturer != "" {
		info.Manufacturer = baseboardInfo.Manufacturer
	}

	if baseboardInfo.Product != "" {
		info.Product = baseboardInfo.Product
	}

	if baseboardInfo.Version != "" {
		info.Version = baseboardInfo.Version
	}

	if baseboardInfo.SerialNumber != "" {
		info.SerialNumber = baseboardInfo.SerialNumber
	}

	if baseboardInfo.AssetTag != "" {
		info.AssetTag = baseboardInfo.AssetTag
	}

	if baseboardInfo.LocationInChassis != "" {
		info.LocationInChassis = baseboardInfo.LocationInChassis
	}

	if baseboardInfo.BoardType > 0 {
		info.BoardType = baseboardInfo.BoardType.String()
	}

	var features []string
	if baseboardInfo.FeatureFlags.IsHostingBoard() {
		features = append(features, "Hosting Board")
	}
	if len(features) > 0 {
		info.FeatureFlags = features
	}

	return info
}

// Format helpers for weather (used by weather.go)

// Format1 formats a float with 1 decimal place, trimming trailing zeros.
func Format1(v float64) string {
	return strings.TrimRight(strings.TrimRight(FmtFloat(v, 1), "0"), ".")
}

// Format0 formats a float with 0 decimal places.
func Format0(v float64) string {
	return strings.TrimRight(strings.TrimRight(FmtFloat(v, 0), "0"), ".")
}

// FmtFloat formats a float with the specified number of decimals.
func FmtFloat(v float64, decimals int) string {
	pow := 1.0
	for i := 0; i < decimals; i++ {
		pow *= 10
	}
	iv := int64(v*pow + 0.5)
	neg := iv < 0
	if neg {
		iv = -iv
	}
	s := Itoa(iv)
	if decimals == 0 {
		if neg {
			return "-" + s
		}
		return s
	}
	for len(s) <= decimals {
		s = "0" + s
	}
	pos := len(s) - decimals
	out := s[:pos] + "." + s[pos:]
	if neg {
		return "-" + out
	}
	return out
}

// Itoa converts an int64 to string without using fmt.
func Itoa(v int64) string {
	if v == 0 {
		return "0"
	}
	var b [32]byte
	i := len(b)
	for v > 0 {
		i--
		b[i] = byte('0' + (v % 10))
		v /= 10
	}
	return string(b[i:])
}
