$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
$env:PATHEXT = ".COM;.EXE;.BAT;.CMD;.VBS;.VBE;.WSF;.WSH;.MSC"
Set-Location "C:\spotify-mood-dj"
& "C:\Program Files\nodejs\npm.cmd" run dev
