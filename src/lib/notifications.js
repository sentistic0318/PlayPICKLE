import {Platform} from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import {rpc} from './api';
export async function enablePush(){
 if(Platform.OS==='web')throw new Error('Push notifications are available in the Android and iPhone app. Your in-app inbox still works here.');
 if(!Device.isDevice)throw new Error('Open PlayPICKLE on a physical device to enable push notifications.');
 if(Constants.appOwnership==='expo')throw new Error('Push requires a PlayPICKLE development or production build. Your in-app inbox is already available.');
 const Notifications=await import('expo-notifications');
 if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('default',{name:'PlayPICKLE updates',importance:Notifications.AndroidImportance.DEFAULT});
 let permissions=await Notifications.getPermissionsAsync();if(permissions.status!=='granted')permissions=await Notifications.requestPermissionsAsync();
 if(permissions.status!=='granted')return 'Push is off. You can read all updates in your notification inbox.';
 const projectId=Constants.expoConfig?.extra?.eas?.projectId || process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
 if(!projectId)throw new Error('This build needs an EAS project ID before push can be enabled. See README.');
 const token=(await Notifications.getExpoPushTokenAsync({projectId})).data;
 await rpc('register_push_token',{p_token:token,p_platform:Platform.OS});
 return 'Push notifications enabled on this device.';
}
