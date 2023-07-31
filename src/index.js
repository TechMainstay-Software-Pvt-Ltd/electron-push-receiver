const { PushReceiver } = require('@tmbill/push-receiver');
const { ipcMain } = require('electron');
const Config = require('electron-config');
const {
  START_NOTIFICATION_SERVICE,
  NOTIFICATION_SERVICE_STARTED,
  NOTIFICATION_SERVICE_ERROR,
  NOTIFICATION_RECEIVED,
  TOKEN_UPDATED,
} = require('./constants');

const config = new Config();

// To be sure that start is called only once
let started = false;
let pushReceiverinstance;

// To be call from the main process
function setup(webContents) {
  // Will be called by the renderer process
  ipcMain.on(START_NOTIFICATION_SERVICE, async (_, senderId) => {
    // Retrieve saved credentials
    const credentials = config.get('credentials');
    // Retrieve saved senderId
    const savedSenderId = config.get('senderId');
    if (started) {
      webContents.send(
        NOTIFICATION_SERVICE_STARTED,
        ((credentials && credentials.fcm) || {}).token,
      );
      return;
    }
    started = true;

    try {
      // Retrieve saved persistentId : avoid receiving all already received notifications on start
      const persistentIds = config.get('persistentIds') || [];
      // Register if no credentials or if senderId has changed
      if (!credentials || savedSenderId !== senderId) {
        pushReceiverinstance = new PushReceiver({
          senderId,
          persistentIds,
          credentials,
        });

        pushReceiverinstance.onCredentialsChanged(({ newCredentials }) => {
          console.log(
            'Client generated new credentials. Save them somewhere! And decide if thing are needed to re-subscribe',
            newCredentials,
          );
          // Save credentials for later use
          config.set('credentials', newCredentials);
        });

        pushReceiverinstance.onNotification((notification) => {
          // Do someting with the notification
          const savedpersistentIds = config.get('persistentIds') || [];
          // Update persistentId
          config.set('persistentIds', [...persistentIds, savedpersistentIds]);
          // Notify the renderer process that a new notification has been received
          // And check if window is not destroyed for darwin Apps
          if (!webContents.isDestroyed()) {
            webContents.send(NOTIFICATION_RECEIVED, notification);
          }
        });

        // Save senderId
        config.set('senderId', senderId);
        // Notify the renderer process that the FCM token has changed
        webContents.send(TOKEN_UPDATED, credentials.fcm.token);
      }
      // Notify the renderer process that we are listening for notifications
      webContents.send(NOTIFICATION_SERVICE_STARTED, credentials.fcm.token);
    } catch (e) {
      console.error('PUSH_RECEIVER:::Error while starting the service', e);
      // Forward error to the renderer process
      webContents.send(NOTIFICATION_SERVICE_ERROR, e.message);
    }
  });
}
// Called in the disconnect
function reset() {
  config.set('credentials', null);
  config.set('senderId', null);
  config.set('persistentIds', null);
  started = false;
  if (pushReceiverinstance) {
    pushReceiverinstance.destroy();
    pushReceiverinstance = undefined;
  }
}

module.exports = {
  START_NOTIFICATION_SERVICE,
  NOTIFICATION_SERVICE_STARTED,
  NOTIFICATION_SERVICE_ERROR,
  NOTIFICATION_RECEIVED,
  TOKEN_UPDATED,
  setup,
  reset,
};
