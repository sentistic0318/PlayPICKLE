const {spawnSync}=require('node:child_process');
// Use an isolated build with a fake backend URL. Browser routes below provide
// all data, so this suite never signs in to or sends queries to a live service.
const env={...process.env,EXPO_NO_DOTENV:'1',EXPO_PUBLIC_SUPABASE_URL:'https://playpickle-review.supabase.co',EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'fixture-public-key'};
for(const args of [['node_modules/expo/bin/cli','export','--clear','--platform','web','--output-dir','test-results/review-web'],['node_modules/@playwright/test/cli.js','test','--config','playwright.review.config.js']]){
 const result=spawnSync(process.execPath,args,{env,stdio:'inherit',windowsHide:true});if(result.status!==0)process.exit(result.status||1);
}
