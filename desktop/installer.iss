[Setup]
AppId={{5B356C01-7941-4E98-9FF8-8FE8302E75D8}
AppName=Cockpit
AppVersion={#AppVersion}
VersionInfoVersion={#AppVersion}.0
DefaultDirName={localappdata}\Programs\Cockpit
DefaultGroupName=Cockpit
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\Cockpit.exe
PrivilegesRequired=lowest
SetupArchitecture=x64
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
RestartApplications=no
OutputBaseFilename=Cockpit-{#AppVersion}-win-x64-setup
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "simplifiedchinese"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#BundleDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Cockpit"; Filename: "{app}\Cockpit.exe"; WorkingDir: "{app}"; AppUserModelID: "Cockpit.Personal.Windows"
Name: "{autodesktop}\Cockpit"; Filename: "{app}\Cockpit.exe"; WorkingDir: "{app}"; AppUserModelID: "Cockpit.Personal.Windows"; Tasks: desktopicon

[Run]
Filename: "{app}\Cockpit.exe"; WorkingDir: "{app}"; Description: "{cm:LaunchProgram,Cockpit}"; Flags: nowait postinstall skipifsilent
