const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const LoggerService = require('../service/logger/logger-service');
const ConfigManager = require('./config-manager');

class CloudStorageManager {
    static CLOUDSTORAGE_DIR = path.join(__dirname, '..', '..', 'data', 'cloudstorage');
    static SYSTEM_DIR = path.join(this.CLOUDSTORAGE_DIR, 'system');
    
    static initialize() {
        if (!fs.existsSync(this.CLOUDSTORAGE_DIR)) {
            fs.mkdirSync(this.CLOUDSTORAGE_DIR, { recursive: true });
            LoggerService.log('success', 'CloudStorage directory created');
        }

        if (!fs.existsSync(this.SYSTEM_DIR)) {
            fs.mkdirSync(this.SYSTEM_DIR, { recursive: true });
            LoggerService.log('success', 'System directory created');
        }

        const defaultEngineIniPath = path.join(this.SYSTEM_DIR, 'DefaultEngine.ini');
        if (!fs.existsSync(defaultEngineIniPath)) {
            const content = this.generateDefaultEngine();
            fs.writeFileSync(defaultEngineIniPath, content);
            LoggerService.log('success', 'DefaultEngine.ini created');
        }

        LoggerService.log('success', 'CloudStorage initialized');
    }
    
    static generateDefaultEngine() {
        const gameServersPath = path.join(__dirname, '..', '..', 'config', 'game-servers.json');
        const xmppPort = ConfigManager.get('xmppPort');
        
        let content = `[OnlineSubsystemMcp.Xmpp]
bUseSSL=false
ServerAddr="ws://127.0.0.1"
ServerPort=${xmppPort}

[OnlineSubsystemMcp.Xmpp Prod]
bUseSSL=false
ServerAddr="ws://127.0.0.1"
ServerPort=${xmppPort}

[OnlineSubsystemMcp.OnlineWaitingRoomMcp]
bEnabled=false
ServiceName="waitingroom"
GracePeriod=300
RetryConfigUrl="https://s3-us-west-1.amazonaws.com/launcher-resources/waitingroom"

[Voice]
bEnabled=true

[OnlineSubsystem]
bHasVoiceEnabled=true

[OnlineSubsystemMcp.OnlineIdentityMcp]
bAutoLoginToXmpp=true
bShouldReconnectXmpp=true
bOfflineAccountToken=true
bOfflineClientToken=true
bVerifyAuthIncludesPermissions=true

[VoiceChat.Vivox]
ServerUrl="https://unity.vivox.com/appconfig/"
Domain=mtu1xp.vivox.com
Namespace=

[OnlineSubsystemMcp]
bUsePartySystemV2=false

[OnlineSubsystemMcp.OnlinePartySystemMcpAdapter]
bUsePartySystemV2=false

[CrashContextProperties]
CrashReportClientRichText=NSLOCTEXT("FortGlobals", "FortniteCrashReportClientText", "Fortnite has crashed.")

[XMPP]
bEnableWebsockets=true

[LwsWebSocket]
bDisableCertValidation=true

[/Script/Engine.NetworkSettings]
n.VerifyPeer=false

[/Script/Qos.QosRegionManager]
NumTestsPerRegion=1
PingTimeout=1.0
!RegionDefinitions=ClearArray
`;

        if (fs.existsSync(gameServersPath)) {
            try {
                const gameServers = JSON.parse(fs.readFileSync(gameServersPath, 'utf-8'));
                
                Object.entries(gameServers.regions).forEach(([regionKey, region]) => {
                    const firstServer = region.servers[0];
                    if (firstServer) {
                        content += `+RegionDefinitions=(DisplayName="${region.name}", RegionId="${region.code}", bEnabled=true, bVisible=true, bAutoAssignable=true, Servers[0]=(Address="${firstServer.ip}", Port=${firstServer.port}))\n`;
                    }
                });
            } catch (error) {
                LoggerService.log('warn', `Error loading GameServers.json: ${error.message}`);
                content += this.getDefaultRegions();
            }
        } else {
            LoggerService.log('warn', 'GameServers.json not found, using default regions');
            content += this.getDefaultRegions();
        }

        content += `
[ConsoleVariables]
SupervisedSettings.UseEOSIntegration=false
Store.EnableCatabaScreen=1
Store.EnableCatabaHighlights=1
FortPlaylistManager.CachedPlaylistsEnabled=1
Fort.Rollback.UseCosmeticFlowOnlyWhereRequired=1
Athena.Frontend.ShowMPLobbyOnboardingModal=0
Sparks.Catalog.MidiDecryptionKey="KbSsGNCQFmVZJE4VVIvUwRuY0zrVf3sNm//2zrfPYUU="
CMS.DisableFileCache=true
n.VerifyPeer=0
FortMatchmakingV2.ContentBeaconFailureCancelsMatchmaking=0
Fort.ShutdownWhenContentBeaconFails=0
FortMatchmakingV2.EnableContentBeacon=0

[Core.Log]
LogEngine=Verbose
LogStreaming=Verbose
LogNetDormancy=Verbose
LogNetPartialBunch=Verbose
OodleHandlerComponentLog=Verbose
LogSpectatorBeacon=Verbose
PacketHandlerLog=Verbose
LogPartyBeacon=Verbose
LogNet=Verbose
LogBeacon=Verbose
LogNetTraffic=Verbose
LogDiscordRPC=Verbose
LogEOSSDK=Verbose
LogXmpp=Verbose
LogParty=Verbose
LogMatchmakingServiceClient=Verbose
LogScriptCore=Verbose
LogSkinnedMeshComp=Verbose
LogFortAbility=Verbose
LogContentBeacon=Verbose
LogPhysics=Verbose

[OnlineSubsystemMcp.OnlinePaymentServiceMcp Fortnite]
Domain="launcher-website-prod.ak.epicgames.com"
BasePath="/logout?redirectUrl=https%3A%2F%2Fwww.unrealengine.com%2Fid%2Flogout%3FclientId%3Dxyza7891KKDWlczTxsyy7H3ExYgsNT4Y%26responseType%3Dcode%26redirectUrl%3Dhttps%253A%252F%252FPongodev%252Fid%252Flogin%253FredirectUrl%253Dhttps%253A%252F%252Fploosh.dev%252Fpurchase%252Facquire&path="
`;

        return content;
    }
    
    static getDefaultRegions() {
        return `+RegionDefinitions=(DisplayName="NA-EAST", RegionId="NAE", bEnabled=true, bVisible=true, bAutoAssignable=false, Servers[0]=(Address="127.0.0.1", Port=7777))
+RegionDefinitions=(DisplayName="Na-West", RegionId="NAW", bEnabled=true, bVisible=true, bAutoAssignable=false)
+RegionDefinitions=(DisplayName="Oceania", RegionId="OCE", bEnabled=true, bVisible=true, bAutoAssignable=false)
+RegionDefinitions=(DisplayName="Europe", RegionId="EU", bEnabled=true, bVisible=true, bAutoAssignable=true, Servers[0]=(Address="127.0.0.1", Port=7777))
+RegionDefinitions=(DisplayName="Me", RegionId="ME", bEnabled=false, bVisible=false, bAutoAssignable=false)
+RegionDefinitions=(DisplayName="Brazil", RegionId="BR", bEnabled=true, bVisible=true, bAutoAssignable=false)
`;
    }
    
    static regenerateDefaultEngine() {
        const filePath = path.join(this.SYSTEM_DIR, 'DefaultEngine.ini');
        const content = this.generateDefaultEngine();
        fs.writeFileSync(filePath, content);
        LoggerService.log('success', 'DefaultEngine.ini regenerated');
    }

    static getSystemFiles() {
        const files = [];
        
        if (!fs.existsSync(this.SYSTEM_DIR)) {
            return files;
        }

        const dirFiles = fs.readdirSync(this.SYSTEM_DIR);

        dirFiles.forEach(fileName => {
            if (fileName.toLowerCase().endsWith('.ini')) {
                const filePath = path.join(this.SYSTEM_DIR, fileName);
                const content = fs.readFileSync(filePath, 'utf-8');
                const stats = fs.statSync(filePath);

                files.push({
                    uniqueFilename: fileName,
                    filename: fileName,
                    hash: crypto.createHash('sha1').update(content).digest('hex'),
                    hash256: crypto.createHash('sha256').update(content).digest('hex'),
                    length: Buffer.byteLength(content),
                    contentType: "application/octet-stream",
                    uploaded: stats.mtime.toISOString().replace(/\.\d{3}Z$/, 'Z'),
                    storageType: "S3",
                    storageIds: {},
                    doNotCache: true
                });
            }
        });

        return files;
    }

    static getSystemFile(fileName, season, build = 0) {
        const filePath = path.join(this.SYSTEM_DIR, fileName);

        if (!fs.existsSync(filePath)) {
            return null;
        }

        let content = fs.readFileSync(filePath, 'utf-8');

        if (fileName === 'DefaultEngine.ini' && season >= 23) {
            if (!content.includes('net.AllowEncryption=0')) {
                content += "\n[ConsoleVariables]\nnet.AllowEncryption=0\n";
            }
        }

        if (fileName === 'DefaultRuntimeOptions.ini' && build >= 17.50 && build <= 19.30) {
            content += "\nbLoadDirectlyIntoLobby=false\n";
        }

        return content;
    }
}

module.exports = CloudStorageManager;