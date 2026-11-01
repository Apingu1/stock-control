#requires -Version 5.1
<#
 StkFlo management endpoint. Runs as a Windows startup task under SYSTEM.
 No Docker or StkFlo API dependency. Windows Integrated Authentication over TLS.
 No arbitrary shell/command API is exposed.
#>
param(
    [Parameter(Mandatory=$true)][ValidateSet('Host','VM')][string]$Role,
    [string]$ConfigPath = "$env:ProgramData\StkFlo\Management\manager.json"
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $ConfigPath)) { throw "Manager configuration missing: $ConfigPath" }
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
if ($config.role -ne $Role) { throw 'Agent role/configuration mismatch' }
if (-not $config.admin_group) { throw 'Administrator group is not configured' }
$logFolder = Join-Path (Split-Path -Parent $ConfigPath) 'logs'
New-Item -Path $logFolder -ItemType Directory -Force | Out-Null
$auditFile = Join-Path $logFolder 'management-audit.jsonl'
$port = [int]$config.listen_port
if ($port -lt 1024 -or $port -gt 65535) { throw 'Invalid management port' }

function Audit([string]$actor,[string]$operation,[string]$outcome,[string]$detail) {
    $record = [ordered]@{
        at_utc = [DateTime]::UtcNow.ToString('o')
        actor = $actor
        role = $Role
        operation = $operation
        outcome = $outcome
        detail = $detail
    }
    $line = $record | ConvertTo-Json -Compress -Depth 4
    Add-Content -LiteralPath $auditFile -Value $line -Encoding UTF8
}
function Send-Response($context,[int]$status,[object]$payload,[string]$mediaType='application/json') {
    $body = if ($mediaType -eq 'text/html; charset=utf-8') { [string]$payload } else { $payload | ConvertTo-Json -Compress -Depth 9 }
    $bytes = [Text.Encoding]::UTF8.GetBytes($body)
    $context.Response.StatusCode = $status
    $context.Response.ContentType = $mediaType
    $context.Response.ContentEncoding = [Text.Encoding]::UTF8
    $context.Response.Headers['Cache-Control'] = 'no-store'
    $context.Response.Headers['X-Content-Type-Options'] = 'nosniff'
    $context.Response.Headers['Content-Security-Policy'] = "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
    $context.Response.ContentLength64 = $bytes.Length
    try { $context.Response.OutputStream.Write($bytes,0,$bytes.Length) } finally { $context.Response.Close() }
}
function Read-JsonFile([string]$path) {
    if (-not (Test-Path -LiteralPath $path)) { return $null }
    try { return (Get-Content -LiteralPath $path -Raw | ConvertFrom-Json) } catch { return $null }
}
function Get-HostStatus {
    $vm = Get-VM -Name $config.vm_name -ErrorAction Stop
    return [ordered]@{
        role = 'Host'
        vm_name = $vm.Name
        vm_state = [string]$vm.State
        vm_status = [string]$vm.Status
        vm_uptime = [string]$vm.Uptime
        host = $env:COMPUTERNAME
        at_utc = [DateTime]::UtcNow.ToString('o')
    }
}
function Get-VMStatus {
    $root = [string]$config.install_root
    $stopped = Test-Path -LiteralPath (Join-Path $root 'deployment\manual-stop.flag')
    $health = Read-JsonFile (Join-Path $root 'logs\health-status.json')
    $operation = Read-JsonFile (Join-Path $root 'runtime-state\management-operation.json')
    $backupReplication = Read-JsonFile (Join-Path $root 'runtime-state\backup_replication_status.json')
    $backupDestination = Read-JsonFile (Join-Path $root 'runtime-state\backup_replication_settings.json')
    $api = $false
    try {
        $response = Invoke-RestMethod -Uri 'http://127.0.0.1:8088/api/health' -TimeoutSec 3
        $api = [bool]$response.ok
    } catch { $api = $false }
    return [ordered]@{
        role = 'VM'
        machine = $env:COMPUTERNAME
        api_healthy = $api
        controlled_stop = $stopped
        health_monitor = $health
        last_action = $operation
        backup_replication = $backupReplication
        backup_destination = $backupDestination
        at_utc = [DateTime]::UtcNow.ToString('o')
    }
}
function Invoke-AllowlistedAction([string]$action,[string]$actor,[string]$destination='') {
    if ($Role -eq 'Host') {
        switch ($action) {
            'vm-start' {
                $vm = Get-VM -Name $config.vm_name -ErrorAction Stop
                if ($vm.State -eq 'Running') { return @{ result='ALREADY_RUNNING' } }
                if ($vm.State -ne 'Off') { throw "VM not in an allowable start state: $($vm.State)" }
                Start-VM -Name $config.vm_name -ErrorAction Stop | Out-Null
                return @{ result='START_REQUESTED' }
            }
            'vm-shutdown' {
                $vm = Get-VM -Name $config.vm_name -ErrorAction Stop
                if ($vm.State -eq 'Off') { return @{ result='ALREADY_STOPPED' } }
                if ($vm.State -ne 'Running') { throw "VM not in an allowable shutdown state: $($vm.State)" }
                Stop-VM -Name $config.vm_name -Shutdown -ErrorAction Stop | Out-Null
                return @{ result='GRACEFUL_SHUTDOWN_REQUESTED' }
            }
            'vm-restart' {
                if ($config.allow_force_vm_restart -ne $true) { throw 'Forced VM restart disabled by host policy' }
                $vm = Get-VM -Name $config.vm_name -ErrorAction Stop
                if ($vm.State -ne 'Running') { throw 'VM is not running' }
                Restart-VM -Name $config.vm_name -Force -ErrorAction Stop | Out-Null
                return @{ result='FORCED_VM_RESTART_REQUESTED' }
            }
            default { throw 'Action is not allowed for host agent' }
        }
    }
    if ($Role -eq 'VM') {
        if ($action -eq 'backup-destination') {
            if (-not $config.allowed_backup_roots -or $config.allowed_backup_roots.Count -eq 0) { throw 'Approved backup roots are not configured by IT' }
            $candidate = $destination.TrimEnd('\')
            if (-not $candidate.StartsWith('\') -or $candidate -match '[<>|?*]' -or $candidate.Contains('..')) { throw 'Enter a valid UNC folder path' }
            $allowed = $false
            foreach ($root in $config.allowed_backup_roots) {
                $base = ([string]$root).TrimEnd('\')
                if ($candidate.Equals($base,[StringComparison]::OrdinalIgnoreCase) -or $candidate.StartsWith(($base + '\'),[StringComparison]::OrdinalIgnoreCase)) {
                    $allowed = $true
                }
            }
            if (-not $allowed) { throw 'Destination is outside IT-approved backup shares' }
            $stateDir = Join-Path ([string]$config.install_root) 'runtime-state'
            New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
            $path = Join-Path $stateDir 'backup_replication_settings.json'
            $data = [ordered]@{ enabled=$true; destination_unc=$candidate; updated_by=$actor; updated_at_utc=[DateTime]::UtcNow.ToString('o') }
            $tmp = "$path.tmp"
            $data | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $tmp -Encoding UTF8
            Move-Item -LiteralPath $tmp -Destination $path -Force
            Start-ScheduledTask -TaskName 'StkFlo - Backup Replication' -ErrorAction Stop
            return @{result='VALIDATION_QUEUED'; destination=$candidate; note='Backup share write and replication verification will run under the Docker/SMB user account. Check status for success.'}
        }
        $task = switch ($action) {
            'stack-start' { 'StkFlo - Stack Start' }
            'stack-stop' { 'StkFlo - Stack Stop' }
            'stack-restart' { 'StkFlo - Stack Restart' }
            default { throw 'Action is not allowed for VM agent' }
        }
        $scheduled = Get-ScheduledTask -TaskName $task -ErrorAction Stop
        if ($scheduled.State -eq 'Running') { throw 'An operation is already running' }
        Start-ScheduledTask -TaskName $task -ErrorAction Stop
        return @{ result='QUEUED'; task=$task; note='Queued for the interactive Docker user; refresh status for completion.' }
    }
    throw 'Unknown role'
}
$managementPage = @'
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>StkFlo · Server Manager</title><style>
:root{color-scheme:dark;font-family:Segoe UI,Arial,sans-serif;background:#0b1220;color:#eef6fc}
*{box-sizing:border-box}body{margin:0 auto;max-width:890px;padding:35px 20px}
h1{font-size:29px;letter-spacing:-.6px}p{color:#a4b5c9;line-height:1.6}
.card{border:1px solid #26354a;border-radius:16px;background:#111f31;padding:24px;margin:18px 0}
pre{background:#081320;overflow:auto;padding:18px;border-radius:10px;font:12px/1.5 Consolas,monospace}
button{background:#2cb8a4;color:#081320;border:0;padding:12px 17px;border-radius:9px;font-weight:650;margin:5px 6px 5px 0;cursor:pointer}
button.secondary{background:#233449;color:#dce8f3}button.danger{background:#7b3040;color:white}
small{color:#9daec5}#message{padding-top:9px;min-height:24px}
</style></head><body><h1>StkFlo <span style="color:#2cb8a4">Server Manager</span></h1>
<p>Independent emergency administration. Access requires an approved Windows administrator identity. Operations are recorded in the host audit log.</p>
<div class="card"><h3>Live status</h3><pre id="status">Loading...</pre><button class="secondary" onclick="refresh()">Refresh status</button></div>
<div class="card"><h3>Controlled recovery</h3><div id="actions"></div><small>Stop and restart actions can interrupt active users. Confirm the operation and follow your change-control procedure.</small><div id="message"></div></div>
<div class="card" id="backupBox" style="display:none"><h3>Network backup replication</h3><p>StkFlo creates verified backups locally and copies them to the approved network share for existing cloud backup coverage.</p><input id="unc" placeholder="\\fileserver\backup-share\StkFlo" style="width:100%;padding:12px;border-radius:8px;background:#0b1220;color:white;border:1px solid #33445c"><button onclick="saveBackupDestination()">Validate and save destination</button></div>
<script>
const hostActions=[['vm-start','Start Windows VM'],['vm-shutdown','Shut down VM'],['vm-restart','Force restart VM (policy gated)']];
const vmActions=[['stack-start','Start StkFlo'],['stack-stop','Stop StkFlo'],['stack-restart','Restart StkFlo']];
let role='';
async function refresh(){
 try{
 const res=await fetch('/api/status',{credentials:'same-origin',cache:'no-store'});
 if(!res.ok)throw Error('Status HTTP '+res.status);
 const obj=await res.json();role=obj.role;
 document.getElementById('status').textContent=JSON.stringify(obj,null,2);
 document.getElementById('backupBox').style.display=role==='VM'?'block':'none';
 if(role==='VM' && obj.backup_destination && obj.backup_destination.destination_unc){document.getElementById('unc').value=obj.backup_destination.destination_unc;}
 const actions=role==='Host'?hostActions:vmActions;
 document.getElementById('actions').innerHTML='';
 actions.forEach(function(item){
 const b=document.createElement('button');b.textContent=item[1];
 b.className=/stop|shutdown|restart/.test(item[0])?'danger':'';
 b.onclick=function(){act(item[0],item[1])};
 document.getElementById('actions').appendChild(b);
 });
 }catch(e){document.getElementById('status').textContent=String(e)}
}
async function saveBackupDestination(){
 const destination=document.getElementById('unc').value.trim();
 if(!destination || !confirm('Configure StkFlo to copy verified backups to '+destination+'?'))return;
 await postAction('backup-destination','Save approved backup destination',destination);
}
async function postAction(action,label,destination){
 const reason=prompt('Reason / change reference (required):');
 if(!reason || !reason.trim())return;
 try{
 const res=await fetch('/api/action',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-StkFlo-Action':'1'},body:JSON.stringify({action:action,reason:reason.trim(),destination:destination||''})});
 const obj=await res.json();
 document.getElementById('message').textContent=(res.ok?'Request accepted: ':'Request rejected: ')+JSON.stringify(obj);
 await refresh();
 }catch(e){document.getElementById('message').textContent=String(e)}
}
async function act(action,label){
 if(!confirm('Request '+label+'? This will be audited and may interrupt users.'))return;
 await postAction(action,label);
refresh();
</script></body></html>
'@
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("https://+:$port/")
$listener.AuthenticationSchemes = [Net.AuthenticationSchemes]::Negotiate
$listener.Start()
Audit 'SYSTEM' 'AGENT_START' 'SUCCESS' "$Role agent port $port"
try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        try {
            $identity = $context.User.Identity
            $principal = New-Object Security.Principal.WindowsPrincipal($identity)
            $group = "$env:COMPUTERNAME\$($config.admin_group)"
            if (-not $identity.IsAuthenticated -or -not $principal.IsInRole($group)) {
                Audit $identity.Name 'AUTH' 'DENIED' 'Not member of StkFlo management group'
                Send-Response $context 403 @{error='Access denied: StkFlo management membership required'}
                continue
            }
            $path = $context.Request.Url.AbsolutePath
            if ($context.Request.HttpMethod -eq 'GET' -and $path -eq '/') {
                Send-Response $context 200 $managementPage 'text/html; charset=utf-8'
                continue
            }
            if ($context.Request.HttpMethod -eq 'GET' -and $path -eq '/api/status') {
                $status = if ($Role -eq 'Host') { Get-HostStatus } else { Get-VMStatus }
                Send-Response $context 200 $status
                continue
            }
            if ($context.Request.HttpMethod -eq 'POST' -and $path -eq '/api/action') {
                # Custom header ensures cross-origin forms cannot trigger Windows-authenticated actions.
                if ($context.Request.Headers['X-StkFlo-Action'] -ne '1') { Send-Response $context 403 @{error='Action header required'}; continue }
                $origin = $context.Request.Headers['Origin']
                if ($origin -and $origin -ne ("https://" + $context.Request.Url.Authority)) {
                    Send-Response $context 403 @{error='Origin is not permitted'}
                    continue
                }
                if ($context.Request.ContentLength64 -gt 4096 -or $context.Request.ContentLength64 -lt 0) {
                    Send-Response $context 413 @{error='Invalid request size'}
                    continue
                }
                $reader = New-Object IO.StreamReader($context.Request.InputStream,[Text.Encoding]::UTF8)
                $requestBody = $reader.ReadToEnd() | ConvertFrom-Json
                $action = [string]$requestBody.action
                $reason = [string]$requestBody.reason
                if ($reason.Trim().Length -lt 4 -or $reason.Length -gt 300) { Send-Response $context 400 @{error='Reason of 4-300 characters is required'}; continue }
                try {
                    $result = Invoke-AllowlistedAction $action $identity.Name ([string]$requestBody.destination)
                    Audit $identity.Name $action 'ACCEPTED' $reason
                    Send-Response $context 202 $result
                } catch {
                    Audit $identity.Name $action 'FAILED' ($reason + ': ' + $_.Exception.Message)
                    Send-Response $context 400 @{error=$_.Exception.Message}
                }
                continue
            }
            Send-Response $context 404 @{error='Not found'}
        } catch {
            Audit 'SYSTEM' 'REQUEST' 'ERROR' $_.Exception.Message
            try { Send-Response $context 500 @{error='Management request failed; consult the host audit log'} } catch {}
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
    Audit 'SYSTEM' 'AGENT_STOP' 'SUCCESS' 'Listener exited'
}
