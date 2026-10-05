$f = (Get-Item '.\*.doc').FullName
$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
    $doc = $word.Documents.Open($f)
    $doc.SaveAs2((Join-Path (Get-Location) 'doc_full.docx'), 12)
    Write-Host "Saved doc_full.docx"
} finally {
    if ($doc) { $doc.Close($false) }
    $word.Quit()
}
