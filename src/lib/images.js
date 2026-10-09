import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import {client,unwrap} from './api';
export async function chooseAndUploadImage(bucket,ownerId){
 const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:true,aspect:bucket==='avatars'?[1,1]:[4,3],quality:0.8,base64:true});
 if(result.canceled)return null;
 const asset=result.assets[0];if(!asset.base64)throw new Error('Unable to read that image. Try a JPEG or PNG.');
 const raw=atob(asset.base64),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
 if(bytes.length>5*1024*1024)throw new Error('Please choose an image smaller than 5 MB.');
 const contentType=asset.mimeType||'image/jpeg';
 if(!['image/jpeg','image/png','image/webp'].includes(contentType))throw new Error('Please select a JPEG, PNG, or WebP image.');
 const extension=contentType==='image/png'?'png':contentType==='image/webp'?'webp':'jpg';
 const path=ownerId+'/'+Crypto.randomUUID()+'.'+extension;
 await unwrap(client().storage.from(bucket).upload(path,bytes.buffer,{contentType,upsert:false}));
 return client().storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
