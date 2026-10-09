import {Platform} from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {rpc,client,unwrap} from './api';
import {signOutWithDeviceCleanup} from './signOut';
import {clearStoredSession} from './supabase';
const tokenKey='playpickle.push.device-token';
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
 await AsyncStorage.setItem(tokenKey,token);
 await rpc('register_push_token',{p_token:token,p_platform:Platform.OS});
 return 'Push notifications enabled on this device.';
}

async function unregisterDevicePush(signal) {
 if(Platform.OS==='web')return;
 let token=await AsyncStorage.getItem(tokenKey);
 // Upgrade path for devices enabled by an older app that did not cache tokens.
 if(!token&&Device.isDevice&&Constants.appOwnership!=='expo') {
  const Notifications=await import('expo-notifications');
  const projectId=Constants.expoConfig?.extra?.eas?.projectId||process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if(projectId&&(await Notifications.getPermissionsAsync()).status==='granted') {
   token=(await Notifications.getExpoPushTokenAsync({projectId})).data;
   await AsyncStorage.setItem(tokenKey,token);
  }
 }
 if(!token||signal.aborted)return;
 await unwrap(client().rpc('unregister_push_token',{p_token:token}).abortSignal(signal));
}
export function signOutDevice() {
 return signOutWithDeviceCleanup(client().auth,unregisterDevicePush,{clearStoredSession});
}
