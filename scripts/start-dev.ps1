param(
  [int]$Port = 3002
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location -LiteralPath $root

$env:MOCK_AUTH = "true"
$env:NEXTAUTH_SECRET = "local-build-secret"

& ".\node_modules\.bin\next.cmd" dev -p $Port
