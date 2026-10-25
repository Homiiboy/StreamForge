// Docker smoke test: actual Chromium launch under the production sandbox profile.
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,chromiumSandbox:true,args:['--disable-dev-shm-usage']});
try{
 const page=await browser.newPage();
 await page.setContent('<!doctype html><title>ForgeCore Chromium OK</title><video muted></video>');
 const result=await page.title();
 if(result!=='ForgeCore Chromium OK')throw Error('Chromium DOM smoke check failed');
 process.stdout.write('Sandboxed Chromium startup and page rendering OK\n');
}finally{await browser.close()}
