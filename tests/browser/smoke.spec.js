const {test,expect}=require('@playwright/test');
for(const width of [320,390,768]){
 test('setup and protected navigation at '+width+'px',async({page})=>{
  await page.setViewportSize({width,height:844});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await expect(page.getByText('Find your court.',{exact:false})).toBeVisible();
  await expect(page.getByText('PlayPICKLE needs its Supabase connection before accounts and reservations can go live.')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
  await page.goto('/manage');await expect(page.getByText('PlayPICKLE needs its Supabase connection before accounts and reservations can go live.')).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({path:'test-results/setup-'+width+'.png',fullPage:true});
 });
}
test('an incomplete auth link gives a recoverable error',async({page})=>{
 await page.goto('/auth/callback?error_description=This%20link%20has%20expired');
 await expect(page.getByRole('button',{name:'Return to sign in'})).toBeVisible();
 await page.getByRole('button',{name:'Return to sign in'}).click();
 await expect(page.getByText('Find your court.',{exact:false})).toBeVisible();
});
