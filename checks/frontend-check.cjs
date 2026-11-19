// Run with Node.js: node checks/frontend-check.cjs
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const el=()=>({innerHTML:'',textContent:'',scrollTop:0,scrollHeight:100,classList:{add(){},remove(){}},addEventListener(){},close(){},showModal(){}});
const elements=new Map();const get=s=>{if(!elements.has(s))elements.set(s,el());return elements.get(s)};
let messages=[{id:1,senderNickname:'Peer',content:'Same text',createdAt:'2026-01-01 10:00:00'},{id:2,senderNickname:'Peer',content:'Same text',createdAt:'2026-01-01 10:01:00'}];let rejectSend=false;
const context={console,URLSearchParams,structuredClone,setInterval(){},setTimeout(){},clearTimeout(){},location:{hash:''},document:{querySelector:get,querySelectorAll:()=>[]},window:{APP_CONTEXT:'/campusverse-lite',CSRF_TOKEN:'test-token',INITIAL_STUDENT:{id:1},addEventListener(){},scrollTo(){}},fetch:async(url,opts={})=>{
 let data=[];let status=200;
 if(url.includes('/student')) data={loggedIn:true,nickname:'StudentA',interests:['Java']};
 else if(url.includes('/chat?rooms'))data=[{id:1,name:'Java'},{id:2,name:'DSA'}];
 else if(url.includes('/api/messages'))data=messages;
 else if(url.endsWith('/messages')){if(rejectSend){status=500;data={error:'Database unavailable'}}else data={messageId:3};}
 return {ok:status===200,status,headers:{get:n=>n==='Content-Type'?'application/json':n==='X-CSRF-Token'?'test-token':null},json:async()=>data};
}};
vm.createContext(context);vm.runInContext(fs.readFileSync('src/main/webapp/js/app.js','utf8'),context);
(async()=>{
 await vm.runInContext('boot()',context);
 assert.equal(vm.runInContext('state.profile.name',context),'StudentA');
 assert.equal(vm.runInContext('allDoubts().length + allGhosts().length + peers.length',context),0,'No demo records mixed with server data');
 const loginMarkup=vm.runInContext("loggedIn=false; render(); document.querySelector('#main').innerHTML",context);
 const nicknamePattern=loginMarkup.match(/pattern="([^"]+)"/);
 assert.ok(nicknamePattern,'Nickname input must have a validation pattern');
 assert.ok(new RegExp(nicknamePattern[1],'v').test('Student Name'),'Nickname pattern must support modern browsers and spaces');
 vm.runInContext('loggedIn=true; render()',context);
 vm.runInContext("current='chat';room='Java'",context);
 await vm.runInContext('syncRoomMessages()',context);await vm.runInContext('syncRoomMessages()',context);
 assert.equal(vm.runInContext('state.messages.Java.length',context),2,'Distinct IDs with identical text are retained, repeated poll IDs deduplicated');
 rejectSend=true;const input={value:'Keep my draft'},button={disabled:false};
 context.sendEvent={preventDefault(){},target:{querySelector:s=>s==='button'?button:input}};
 await vm.runInContext('sendMessage(sendEvent)',context);
 assert.equal(input.value,'Keep my draft');assert.equal(button.disabled,false);
 console.log('Frontend checks: PASS (server state, duplicate handling, repeated text, failed-send draft preservation)');
})().catch(err=>{console.error(err);process.exitCode=1});
