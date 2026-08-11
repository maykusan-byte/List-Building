param(
    [Parameter(Mandatory = $true)]
    [string]$SessionLog,

    [Parameter(Mandatory = $true)]
    [string]$GuideSixSource,

    [Parameter(Mandatory = $true)]
    [string]$OutputRoot
)

$ErrorActionPreference = 'Stop'
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)

$catalog = @(
    @{ Number = 1;  Slug = 'battlefield-dominance';                  Script = 'narration-fr.txt' },
    @{ Number = 2;  Slug = 'meatgrinder';                            Script = 'narration-meatgrinder-fr.txt' },
    @{ Number = 3;  Slug = 'outmanoeuvre';                           Script = 'narration-outmanoeuvre-fr.txt' },
    @{ Number = 4;  Slug = 'gather-intel';                           Script = 'narration-gather-intel-fr.txt' },
    @{ Number = 5;  Slug = 'sabotage';                               Script = 'narration-sabotage-fr.txt' },
    @{ Number = 6;  Slug = 'take-and-hold-vs-purge-the-foe';         Script = 'narration-guide-06-take-hold-vs-purge-fr.txt' },
    @{ Number = 7;  Slug = 'take-and-hold-vs-disruption';            Script = 'narration-guide-07-take-hold-vs-disruption-fr.txt' },
    @{ Number = 8;  Slug = 'take-and-hold-vs-reconnaissance';        Script = 'narration-guide-08-take-hold-vs-reconnaissance-fr.txt' },
    @{ Number = 9;  Slug = 'take-and-hold-vs-priority-assets';       Script = 'narration-guide-09-take-hold-vs-priority-assets-fr.txt' },
    @{ Number = 10; Slug = 'purge-the-foe-vs-disruption';            Script = 'narration-guide-10-purge-vs-disruption-fr.txt' },
    @{ Number = 11; Slug = 'purge-the-foe-vs-reconnaissance';        Script = 'narration-guide-11-purge-vs-reconnaissance-fr.txt' },
    @{ Number = 12; Slug = 'purge-the-foe-vs-priority-assets';       Script = 'narration-guide-12-purge-vs-priority-assets-fr.txt' },
    @{ Number = 13; Slug = 'disruption-vs-reconnaissance';           Script = 'narration-guide-13-disruption-vs-reconnaissance-fr.txt' },
    @{ Number = 14; Slug = 'disruption-vs-priority-assets';          Script = 'narration-guide-14-disruption-vs-priority-assets-fr.txt' },
    @{ Number = 15; Slug = 'reconnaissance-vs-priority-assets';      Script = 'narration-guide-15-reconnaissance-vs-priority-assets-fr.txt' }
)

$sourceDir = Join-Path $OutputRoot '01-guides-sources'
$scriptDir = Join-Path $OutputRoot '02-scripts-audio'
[System.IO.Directory]::CreateDirectory($sourceDir) | Out-Null
[System.IO.Directory]::CreateDirectory($scriptDir) | Out-Null

$guideMessages = @{}
Get-Content -Encoding utf8 -LiteralPath $SessionLog | ForEach-Object {
    try {
        $entry = $_ | ConvertFrom-Json
    }
    catch {
        return
    }

    if ($entry.type -ne 'response_item' -or $entry.payload.role -ne 'user') {
        return
    }

    foreach ($content in $entry.payload.content) {
        if ($content.type -ne 'input_text') {
            continue
        }

        if ($content.text -match 'Guide\s+(\d{1,2})/15') {
            $number = [int]$Matches[1]
            if ($content.text.Length -gt 1000) {
                $guideMessages[$number] = [string]$content.text
            }
        }
    }
}

function Normalize-Newlines([string]$Text) {
    return (($Text -replace "`r`n", "`n") -replace "`r", "`n").Trim()
}

function Extract-Guide([string]$Text, [int]$Number) {
    $normalized = Normalize-Newlines $Text
    $match = [regex]::Match($normalized, "(?m)#?[ \t]*Guide\s+$Number/15\s*[—-].*$")
    if (-not $match.Success) {
        throw "Titre introuvable pour le guide $Number."
    }

    $guide = $normalized.Substring($match.Index).Trim()
    $guide = [regex]::Replace($guide, "(?m)^#?\s*Guide\s+$Number/15", "GUIDE $Number/15")
    return $guide
}

function Format-Source([string]$GuideText) {
    $divider = '════════════════════════════════════════════════════════════'
    $lines = $GuideText -split "`n"
    $title = $lines[0].Trim()
    $body = ($lines | Select-Object -Skip 1) -join "`n"
    $body = [regex]::Replace($body, "(?m)^---\s*$", $divider)
    return @(
        $divider,
        $title,
        'VERSION SOURCE FOURNIE POUR LA SÉRIE AUDIO',
        $divider,
        '',
        $body.Trim(),
        ''
    ) -join "`r`n"
}

function Format-Narration([string]$Narration, [int]$Number) {
    $divider = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    $normalized = Normalize-Newlines $Narration
    $paragraphs = [regex]::Split($normalized, "\n\s*\n") | Where-Object { $_.Trim().Length -gt 0 }
    $title = $paragraphs[0].Trim()
    $output = [System.Collections.Generic.List[string]]::new()

    $output.Add($divider)
    $output.Add("SCRIPT AUDIO — GUIDE $Number/15")
    $output.Add($title)
    $output.Add('Voix masculine française · narration pédagogique et tactique')
    $output.Add($divider)

    foreach ($paragraph in ($paragraphs | Select-Object -Skip 1)) {
        $text = $paragraph.Trim()
        $section = $null

        if ($text -match '^(Commençons|Commençons par)') {
            $section = 'PREMIER CAMP — RÈGLES ET PLAN DE JEU'
        }
        elseif ($text -match '^(Passons|Passons maintenant)') {
            $section = 'SECOND CAMP — RÈGLES ET PLAN DE JEU'
        }
        elseif ($text -match '^(Regardons maintenant les (deux )?listes|Regardons les listes|Voyons les listes)') {
            $section = "LISTES D’EXEMPLE ET RÔLES TACTIQUES"
        }
        elseif ($text -match '^(Voici maintenant une partie|Voici une partie|Voyons maintenant une partie|Regardons maintenant une partie)') {
            $section = 'PARTIE ILLUSTRATIVE — CINQ ROUNDS'
        }
        elseif ($text -match '^Au premier round') {
            $section = 'ROUND 1'
        }
        elseif ($text -match '^Au deuxième round') {
            $section = 'ROUND 2'
        }
        elseif ($text -match '^Au troisième round') {
            $section = 'ROUND 3'
        }
        elseif ($text -match '^Au quatrième round') {
            $section = 'ROUND 4'
        }
        elseif ($text -match '^Au cinquième round') {
            $section = 'ROUND 5'
        }
        elseif ($text -match '^(Pour bien jouer|Pour jouer|Pour le joueur|Pour le camp)') {
            $section = 'CONSEILS PRATIQUES'
        }
        elseif ($text -match '^(Le verdict|Verdict|La phrase à retenir)') {
            $section = 'VERDICT ET IDÉE À RETENIR'
        }

        if ($null -ne $section) {
            $output.Add('')
            $output.Add($divider)
            $output.Add($section)
            $output.Add($divider)
        }

        $output.Add('')
        $output.Add($text)
    }

    $output.Add('')
    return $output -join "`r`n"
}

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
foreach ($item in $catalog) {
    $number = [int]$item.Number
    $numberText = '{0:D2}' -f $number

    if ($number -eq 6) {
        $rawGuide = Get-Content -Raw -Encoding utf8 -LiteralPath $GuideSixSource
    }
    elseif ($guideMessages.ContainsKey($number)) {
        $rawGuide = $guideMessages[$number]
    }
    else {
        throw "Message source manquant pour le guide $number."
    }

    $guideText = Extract-Guide $rawGuide $number
    $sourcePath = Join-Path $sourceDir "guide-$numberText-source-$($item.Slug).txt"
    [System.IO.File]::WriteAllText($sourcePath, (Format-Source $guideText), $utf8NoBom)

    $narrationPath = Join-Path $baseDir $item.Script
    if (-not (Test-Path -LiteralPath $narrationPath)) {
        throw "Script audio manquant : $narrationPath"
    }

    $narration = Get-Content -Raw -Encoding utf8 -LiteralPath $narrationPath
    $scriptPath = Join-Path $scriptDir "guide-$numberText-script-audio-$($item.Slug).txt"
    [System.IO.File]::WriteAllText($scriptPath, (Format-Narration $narration $number), $utf8NoBom)
}

$sourceFiles = Get-ChildItem -LiteralPath $sourceDir -File | Sort-Object Name
$scriptFiles = Get-ChildItem -LiteralPath $scriptDir -File | Sort-Object Name

[pscustomobject]@{
    SourceDirectory = $sourceDir
    SourceCount = $sourceFiles.Count
    ScriptDirectory = $scriptDir
    ScriptCount = $scriptFiles.Count
    SourceBytes = ($sourceFiles | Measure-Object Length -Sum).Sum
    ScriptBytes = ($scriptFiles | Measure-Object Length -Sum).Sum
} | Format-List
