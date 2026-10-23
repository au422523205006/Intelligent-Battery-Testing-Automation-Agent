param(
    [Parameter(Mandatory=$true)]
    [string]$FilePath,
    
    [Parameter(Mandatory=$false)]
    [string]$DllDir = "C:\Users\Admin\Downloads\UPowerful BST(2022.05.21)\UPowerful BST(2022.05.21)"
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

if (-not (Test-Path $FilePath)) {
    Write-Error "File not found: $FilePath"
    exit 1
}

$corePath = Join-Path $DllDir "DataView.Core.dll"
$analyserPath = Join-Path $DllDir "DataView.DataAnalyser.dll"

if (-not (Test-Path $corePath) -or -not (Test-Path $analyserPath)) {
    Write-Error "uPowerful BST DLLs not found in $DllDir"
    exit 2
}

try {
    [System.Reflection.Assembly]::LoadFrom($corePath) | Out-Null
    [System.Reflection.Assembly]::LoadFrom($analyserPath) | Out-Null

    $factory = New-Object DataView.DataAnalyser.AnalyserFactory
    $header = $factory.GetRecordHeader($FilePath)
    $headerRef = $header
    $records = New-Object 'System.Collections.Generic.List[DataView.Core.Common.TestRecord]'
    $segNo = 0
    $dict = New-Object 'System.Collections.Generic.Dictionary[int, long]'

    $ok = $factory.TestRecordAnalyse($FilePath, [ref]$headerRef, [ref]$records, [ref]$segNo, [ref]$dict)

    if (-not $ok) {
        Write-Error "TestRecordAnalyse failed for $FilePath"
        exit 3
    }

    # Extract records and calculate summary statistics
    $recList = [System.Collections.ArrayList]::new()
    $maxV = -1e9; $minV = 1e9; $maxC = -1e9; $minC = 1e9
    $maxCap = 0.0; $totalEnergy = 0.0; $maxTemp = -1e9; $minTemp = 1e9; $tempSum = 0.0

    $firstTime = $null
    $lastTime = $null

    foreach ($r in $records) {
        # Voltage in V (source is mV)
        $volts = [double]$r.Voltage / 1000.0
        # Current in A (source is mA)
        $amps = [double]$r.Current / 1000.0
        # Capacity in Ah (source is mAh)
        $capAh = [double]$r.Capacity / 1000.0
        # Energy in Wh (source is mWh)
        $energyWh = [double]$r.Energy / 1000.0
        $temp = [double]$r.dTemper

        if ($volts -gt $maxV) { $maxV = $volts }
        if ($volts -lt $minV) { $minV = $volts }
        if ($amps -gt $maxC) { $maxC = $amps }
        if ($amps -lt $minC) { $minC = $amps }
        if ($capAh -gt $maxCap) { $maxCap = $capAh }
        if ($energyWh -gt $totalEnergy) { $totalEnergy = $energyWh }
        if ($temp -gt $maxTemp) { $maxTemp = $temp }
        if ($temp -lt $minTemp) { $minTemp = $temp }
        $tempSum += $temp

        $rTimeStr = $r.RealTime.ToString("yyyy-MM-dd HH:mm:ss")
        if ($firstTime -eq $null) { $firstTime = $r.RealTime }
        $lastTime = $r.RealTime

        $procTimeSec = ($r.ProcessTime.Hour * 3600) + ($r.ProcessTime.Minute * 60) + $r.ProcessTime.Second

        $recObj = [PSCustomObject]@{
            serial_num = $r.SerialNum
            timestamp = $rTimeStr
            relative_time_sec = $procTimeSec
            voltage = [Math]::Round($volts, 4)
            current = [Math]::Round($amps, 4)
            capacity = [Math]::Round($capAh, 5)
            energy = [Math]::Round($energyWh, 5)
            temperature = [Math]::Round($temp, 2)
            process_type = $r.ProcessType.ToString()
            step_no = $r.StepNo
            cycle_no = $r.RelativeCycleNum
        }
        $recList.Add($recObj) | Out-Null
    }

    $durationSec = 0
    if ($firstTime -ne $null -and $lastTime -ne $null) {
        $durationSec = ($lastTime - $firstTime).TotalSeconds
    }

    $avgTemp = if ($records.Count -gt 0) { [Math]::Round($tempSum / $records.Count, 2) } else { 0.0 }
    if ($minV -eq 1e9) { $minV = 0.0 }
    if ($maxV -eq -1e9) { $maxV = 0.0 }
    if ($minC -eq 1e9) { $minC = 0.0 }
    if ($maxC -eq -1e9) { $maxC = 0.0 }
    if ($minTemp -eq 1e9) { $minTemp = 0.0 }
    if ($maxTemp -eq -1e9) { $maxTemp = 0.0 }

    $result = [PSCustomObject]@{
        header = [PSCustomObject]@{
            procedure_name = if ($headerRef.ProcedureName) { $headerRef.ProcedureName } else { "Unknown" }
            product_batch = if ($headerRef.ProductBatch) { $headerRef.ProductBatch } else { "" }
            barcode = if ($headerRef.Barcode) { $headerRef.Barcode } else { "" }
            channel_no = $headerRef.ChlNo
            box_no = $headerRef.BoxNo
            mid_no = $headerRef.MidNo
            procedure_no = $headerRef.ProcedureNo
            source_file = $FilePath
            record_count = $records.Count
            start_time = if ($firstTime) { $firstTime.ToString("yyyy-MM-dd HH:mm:ss") } else { "" }
            end_time = if ($lastTime) { $lastTime.ToString("yyyy-MM-dd HH:mm:ss") } else { "" }
        }
        summary = [PSCustomObject]@{
            max_voltage = [Math]::Round($maxV, 4)
            min_voltage = [Math]::Round($minV, 4)
            max_current = [Math]::Round($maxC, 4)
            min_current = [Math]::Round($minC, 4)
            capacity_ah = [Math]::Round($maxCap, 5)
            energy_wh = [Math]::Round($totalEnergy, 5)
            peak_temperature = [Math]::Round($maxTemp, 2)
            min_temperature = [Math]::Round($minTemp, 2)
            avg_temperature = $avgTemp
            duration_seconds = [Math]::Round($durationSec, 1)
            total_records = $records.Count
        }
        records = $recList
    }

    $result | ConvertTo-Json -Depth 5 -Compress
} catch {
    Write-Error "Exception: $_"
    exit 4
}
