# generer_structure.ps1
# À exécuter à la racine du projet

param(
    [string]$Output = "structure.json",
    [string[]]$Exclude = @("node_modules", ".git", ".vscode", "__pycache__", "venv")
)

function Get-DirTree {
    param($Path, $Root = $true)

    $items = Get-ChildItem -Path $Path -Force | Sort-Object Name
    $children = @()

    foreach ($item in $items) {
        # Exclure les dossiers/fichiers indésirables
        $relativePath = $item.FullName.Substring($Path.Length + 1)
        if ($Exclude | Where-Object { $relativePath -like "*$_*" -or $relativePath -like "$_*" }) {
            continue
        }

        $node = @{
            name = $item.Name
            path = ($item.FullName -replace [regex]::Escape((Get-Location).Path), "").TrimStart('\')
            type = if ($item.PSIsContainer) { "directory" } else { "file" }
        }

        if ($item.PSIsContainer) {
            $subchildren = Get-DirTree -Path $item.FullName -Root $false
            if ($subchildren.Count -gt 0) {
                $node.children = $subchildren
            }
        } else {
            $node.size = $item.Length
        }

        $children += $node
    }

    if ($Root) {
        $rootNode = @{
            name = (Get-Item $Path).Name
            path = $Path
            type = "directory"
            children = $children
        }
        return $rootNode
    } else {
        return $children
    }
}

# Exécution
$tree = Get-DirTree -Path (Get-Location) -Root $true
$tree | ConvertTo-Json -Depth 20 | Out-File -Encoding UTF8 $Output

Write-Host "Structure exportée dans : $Output" -ForegroundColor Green