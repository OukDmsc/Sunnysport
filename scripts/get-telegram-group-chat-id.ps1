Write-Host "Add SunnySportBookingBot to the Telegram group, then send 'test booking bot' in the group."
$secureToken = Read-Host "Enter the bot token (input is hidden)" -AsSecureString
$tokenPointer = [IntPtr]::Zero

try {
    $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
    if ([string]::IsNullOrWhiteSpace($token)) {
        Write-Output "No token was provided."
        return
    }

    $baseUri = "https://api.telegram.org/bot$token"
    try {
        $webhook = Invoke-RestMethod -Uri "$baseUri/getWebhookInfo" -Method Get -ErrorAction Stop
    }
    catch {
        Write-Output "Could not query Telegram. Check the token and network, then try again."
        return
    }

    if (-not $webhook.ok) {
        Write-Output "Telegram rejected the request. Check the token and try again."
        return
    }
    if (-not [string]::IsNullOrEmpty($webhook.result.url)) {
        Write-Output "A webhook is configured. Telegram getUpdates cannot be used while the webhook is active. Remove or disable it through your bot's deployment settings, then run this helper again. This helper did not change it."
        return
    }

    try {
        $updates = Invoke-RestMethod -Uri "$baseUri/getUpdates" -Method Get -ErrorAction Stop
    }
    catch {
        Write-Output "Could not retrieve Telegram updates. Check the bot configuration and try again."
        return
    }

    if (-not $updates.ok) {
        Write-Output "Telegram did not return updates. Send 'test booking bot' in the group and try again."
        return
    }

    $groupMessage = @($updates.result | Sort-Object update_id -Descending | Where-Object {
        ($_.message.chat.type -eq "group" -or $_.message.chat.type -eq "supergroup") -or
        ($_.edited_message.chat.type -eq "group" -or $_.edited_message.chat.type -eq "supergroup")
    } | ForEach-Object {
        if ($_.message.chat.type -eq "group" -or $_.message.chat.type -eq "supergroup") {
            $_.message.chat
        }
        else {
            $_.edited_message.chat
        }
    } | Select-Object -First 1)

    if ($groupMessage.Count -eq 0) {
        Write-Output "No group update was found. Add the bot to the group, send 'test booking bot' there, and run this helper again."
        return
    }

    Write-Output "Chat ID: $($groupMessage[0].id)"
    Write-Output "Group: $($groupMessage[0].title) (type: $($groupMessage[0].type))"
    if ($groupMessage[0].username) {
        Write-Output "Username: @$($groupMessage[0].username)"
    }
}
finally {
    if ($tokenPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
    }
    $secureToken.Dispose()
    Remove-Variable token, baseUri, webhook, updates, groupMessage -ErrorAction SilentlyContinue
}
