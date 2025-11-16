const ConfigManager = require('../../manager/ConfigManager');

class WaitingRoomService {

    static shouldActivate(currentPlayers) {
        const maxPlayers = ConfigManager.get('maxPlayers');
        const threshold = ConfigManager.get('waitingRoomThreshold');
        
        const percentage = (currentPlayers / maxPlayers) * 100;
        
        return percentage >= threshold;
    }
    
    static calculateWaitTime(currentPlayers) {
        const maxPlayers = ConfigManager.get('maxPlayers');
        const threshold = ConfigManager.get('waitingRoomThreshold');
        const minutesPerPercent = ConfigManager.get('waitingRoom_1');
        
        const percentage = Math.floor((currentPlayers / maxPlayers) * 100);
        
        if (percentage < threshold) {
            return {
                percentage: percentage,
                waitTimeSeconds: 0,
                waitTimeMinutes: 0,
                expectedWait: new Date().toISOString(),
                queueActive: false,
                queuePosition: 0,
                estimatedPlayers: currentPlayers
            };
        }
        
        const percentageAboveThreshold = percentage - threshold;
        
        const waitMinutes = Math.ceil(percentageAboveThreshold * minutesPerPercent);
        
        const playersAboveThreshold = currentPlayers - (maxPlayers * threshold / 100);
        const queuePosition = Math.max(1, Math.floor(playersAboveThreshold));
        
        return {
            percentage: percentage,
            percentageAboveThreshold: percentageAboveThreshold,
            waitTimeSeconds: waitMinutes * 60,
            waitTimeMinutes: waitMinutes,
            expectedWait: new Date(Date.now() + waitMinutes * 60 * 1000).toISOString(),
            queueActive: true,
            queuePosition: queuePosition,
            estimatedPlayers: currentPlayers,
            maxPlayers: maxPlayers,
            availableSlots: Math.max(0, maxPlayers - currentPlayers)
        };
    }
    
    static getWaitingRoomMessage(waitInfo) {
        if (!waitInfo.queueActive) {
            return 'Server is available. Connecting...';
        }
        
        const { waitTimeMinutes, queuePosition } = waitInfo;
        
        if (waitTimeMinutes < 2) {
            return `You're in the queue! Estimated wait: Less than 2 minutes. Position: ${queuePosition}`;
        } else if (waitTimeMinutes < 5) {
            return `High server load. Estimated wait: ${waitTimeMinutes} minutes. Position: ${queuePosition}`;
        } else {
            return `Server is at capacity. Estimated wait: ${waitTimeMinutes} minutes. Position: ${queuePosition}. Thank you for your patience!`;
        }
    }
    
    static isMaintenanceMode() {
        return ConfigManager.get('maintenanceMode', false);
    }
    static getMaintenanceInfo() {
        return {
            inMaintenance: true,
            message: ConfigManager.get('maintenanceMessage'),
            estimatedDowntime: ConfigManager.get('maintenanceEstimatedDowntime')
        };
    }
}

module.exports = WaitingRoomService;