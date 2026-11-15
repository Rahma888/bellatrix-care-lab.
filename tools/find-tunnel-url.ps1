# Used by "Start phone test.bat": waits for the https://....trycloudflare.com address in the tunnel's
# log and prints it clearly: where to enter it (robot), the family portal and the call links
# (TEST-TELEPHONE-1.16.md).
param([string]$Log, [int]$Seconds = 90)
$end = (Get-Date).AddSeconds($Seconds)
while ((Get-Date) -lt $end) {
  if ($Log -and (Test-Path $Log)) {
    $m = Select-String -Path $Log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' | Select-Object -First 1
    if ($m) {
      $u = $m.Matches[0].Value
      $line = '=' * 66
      Write-Host ''
      Write-Host $line -ForegroundColor Cyan
      Write-Host ('  Adresse HTTPS du test :  ' + $u) -ForegroundColor Yellow
      Write-Host $line -ForegroundColor Cyan
      Write-Host '  1. Sur le robot : Care Team > Famille > Appels > Reglages (en bas)'
      Write-Host '     > Adresse du serveur d appel :'
      Write-Host ('        ' + $u + '      puis Enregistrer')
      Write-Host '     (messages, album, Premium et appels du robot passent alors par cette adresse)'
      Write-Host '  2. Portail famille, sur le telephone :'
      Write-Host ('        ' + $u + '/portail.html')
      Write-Host '     (les invitations et QR codes de Care Team > Famille > Comptes pointent alors ici)'
      Write-Host '  3. Appels : les liens famille commencent par :'
      Write-Host ('        ' + $u + '/famille.html#...')
      Write-Host '  4. Apres le test, ferme la fenetre du tunnel : l adresse est publique tant qu il tourne.'
      Write-Host '     Guide : TEST-TELEPHONE-1.16.md'
      Write-Host $line -ForegroundColor Cyan
      exit 0
    }
  }
  Start-Sleep -Milliseconds 700
}
Write-Host ('Pas d adresse apres ' + $Seconds + ' s : regarde la fenetre du tunnel.') -ForegroundColor Red
exit 1
