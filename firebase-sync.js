import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,signInAnonymously,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,collection,getDoc,setDoc,deleteDoc,writeBatch,onSnapshot,serverTimestamp,updateDoc} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
const app=initializeApp({apiKey:'AIzaSyBdsFC8U2IkeeIQUIzg18MPajN808uPmyQ',authDomain:'minha-compra-inteligente.firebaseapp.com',projectId:'minha-compra-inteligente',storageBucket:'minha-compra-inteligente.firebasestorage.app',messagingSenderId:'978258885612',appId:'1:978258885612:web:c5f7f316f3d1f9b92bdec9'});
const auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id),bridge=window.shoppingBridge;
let uid=null,listId=null,unsubItems=null,unsubList=null,remoteItems=new Map(),remoteBudget=0,ready=false,readyItems=false,readyList=false,applying=false;
let displayedItems=new Map(),displayedBudget=0,pending=new Map(),pendingBudget=null,writeQueue=Promise.resolve(),generation=0;
const status=t=>{$('syncStatus').textContent=t};
const randomCode=(bytes=16)=>Array.from(crypto.getRandomValues(new Uint8Array(bytes)),x=>x.toString(16).padStart(2,'0')).join('');
const errorText=e=>`${e.code||'Erro'}: ${e.message||e}`;
const inviteFromUrl=new URL(location.href).searchParams.get('convite');
if(inviteFromUrl){const clean=new URL(location.href);clean.searchParams.delete('convite');history.replaceState(null,'',clean.pathname+clean.search+clean.hash);}
const inviteLink=()=>{const u=new URL('./',location.href);u.searchParams.set('convite',$('inviteCode').value);return u.href;};
async function copyText(value,message){try{await navigator.clipboard.writeText(value);status(message);}catch{prompt('Copie:',value);}}
async function joinByCode(code){
 if(!uid)return status('Aguarde a autenticação.');
 code=(code||'').trim().toLowerCase();
 if(!/^[a-f0-9]{32}$/.test(code))return status('Código inválido.');
 try{
  const invite=await getDoc(doc(db,'convites',code));
  if(!invite.exists())throw Error('Convite não encontrado');
  const data=invite.data();
  if(data.expiresAt<Date.now())throw Error('Convite expirado');
  if(listId===data.listId)return status('Você já está nesta lista compartilhada.');
  if(listId&&!confirm('Trocar a lista compartilhada deste aparelho?'))return;
  await setDoc(doc(db,'listas',data.listId,'membros',uid),{uid,role:'member',inviteCode:code,joinedAt:serverTimestamp()});
  await connect(data.listId);
 }catch(e){status('Não foi possível entrar: '+errorText(e));}
}
let qrLoading=null;
async function showQR(){
 const area=$('qrArea'),target=$('qrCanvas');
 if(!area.classList.contains('hidden')){area.classList.add('hidden');return;}
 area.classList.remove('hidden');target.textContent='Gerando QR Code...';
 try{
  if(!window.QRCode){
   qrLoading??=new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload=resolve;s.onerror=()=>reject(Error('Biblioteca QR indisponível'));document.head.append(s);
   }).catch(e=>{qrLoading=null;throw e});
   await qrLoading;
  }
  target.replaceChildren();
  new window.QRCode(target,{text:inviteLink(),width:220,height:220,correctLevel:window.QRCode.CorrectLevel.M});
 }catch(e){target.textContent='Não foi possível gerar o QR Code. Use Copiar link ou WhatsApp.';}
}
$('showQR').onclick=showQR;
$('copyLink').onclick=()=>copyText(inviteLink(),'Link de convite copiado.');
$('shareWhatsApp').onclick=()=>{
 const message='Entre na minha lista de compras compartilhada (convite válido por 24 horas): '+inviteLink();
 window.open('https://wa.me/?text='+encodeURIComponent(message),'_blank','noopener,noreferrer');
};

const plain=x=>({id:x.id,name:x.name,pack:x.pack,dept:x.dept,qty:Number(x.qty),price:Number(x.price),selected:!!x.selected,done:!!x.done});
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const productFields=['name','pack','dept','qty','price','selected','done'];
function diffProduct(before,after){const patch={};for(const field of productFields)if(!equal(before[field],after[field]))patch[field]=after[field];return patch;}
function mergePending(previous,next){
 if(!previous)return next;
 if(next.kind==='delete'||next.kind==='set')return next;
 if(previous.kind==='set'&&next.kind==='update')return {kind:'set',value:{...previous.value,...next.patch}};
 if(previous.kind==='update'&&next.kind==='update')return {kind:'update',patch:{...previous.patch,...next.patch}};
 return next;
}
function clearPending(id,written){
 const latest=pending.get(id);if(!latest)return;
 if(written.kind==='set'&&latest.kind==='set'&&equal(written.value,latest.value)){pending.delete(id);return;}
 if(written.kind==='delete'&&latest.kind==='delete'){pending.delete(id);return;}
 if(written.kind==='update'&&latest.kind==='update'){
  const remaining={...latest.patch};
  for(const [field,value] of Object.entries(written.patch))if(field in remaining&&equal(remaining[field],value))delete remaining[field];
  if(Object.keys(remaining).length)pending.set(id,{kind:'update',patch:remaining});else pending.delete(id);
 }
}
function applyOperationToRemote(id,operation){
 if(operation.kind==='delete'){remoteItems.delete(id);return;}
 if(operation.kind==='set'){remoteItems.set(id,plain(operation.value));return;}
 const current=remoteItems.get(id)||{id};remoteItems.set(id,plain({...current,...operation.patch,id}));
}
function disconnect(){generation++;unsubItems?.();unsubList?.();unsubItems=unsubList=null;ready=false;readyItems=false;readyList=false;remoteItems.clear();remoteBudget=0;pending.clear();pendingBudget=null;displayedItems.clear();displayedBudget=0;listId=null;$('inviteArea').classList.add('hidden');$('qrArea').classList.add('hidden');$('generateInvite').classList.add('hidden');$('leaveShared').classList.add('hidden');}
function applyRemote(){
 if(!ready)return;
 const combined=new Map([...remoteItems].map(([id,item])=>[id,plain(item)]));
 for(const [id,operation] of pending){
  if(operation.kind==='delete'){combined.delete(id);continue;}
  if(operation.kind==='set'){combined.set(id,plain(operation.value));continue;}
  const current=combined.get(id)||displayedItems.get(id);
  if(!current)continue;
  combined.set(id,plain({...current,...operation.patch,id}));
 }
 const nextBudget=pendingBudget===null?remoteBudget:pendingBudget;
 const ordered=[...combined.values()].map(item=>plain(item)).sort((a,b)=>(a.name||'').localeCompare(b.name||'','pt-BR'));
 applying=true;try{bridge.apply(ordered,nextBudget);displayedItems=new Map(ordered.map(item=>[item.id,plain(item)]));displayedBudget=nextBudget;}finally{applying=false}
}
async function connect(id){
 disconnect();const gen=generation;listId=id;localStorage.setItem('shared-list-id',id);$('leaveShared').classList.remove('hidden');$('generateInvite').classList.remove('hidden');status('Sincronizando lista...');
 unsubList=onSnapshot(doc(db,'listas',id),snap=>{
  if(gen!==generation)return;
  if(!snap.exists()){readyList=false;ready=false;status('Lista indisponível.');return;}
  remoteBudget=Number(snap.data().budget||0);readyList=true;
  if(readyItems){ready=true;applyRemote();}
 },error=>{if(gen===generation){readyList=false;ready=false;status('Erro na lista: '+errorText(error));}});
 unsubItems=onSnapshot(collection(db,'listas',id,'produtos'),snap=>{
  if(gen!==generation)return;
  remoteItems=new Map(snap.docs.map(d=>[d.id,plain({...d.data(),id:d.id})]));readyItems=true;
  if(readyList){ready=true;applyRemote();status('✓ Sincronizado — alterações aparecem nos dois celulares');}
 },error=>{if(gen===generation){readyItems=false;ready=false;status('Erro de sincronização: '+errorText(error));}});
}
function queueWrite(retryPending=false){
 if(applying||!listId||!ready||!uid)return;
 const target=listId,gen=generation,now=new Map(bridge.getItems().map(item=>[item.id,plain(item)])),budget=bridge.getBudget();
 const changes=new Map();if(retryPending)for(const [id,operation] of pending)changes.set(id,operation);
 for(const [id,value] of now){
  const before=displayedItems.get(id);let operation=null;
  if(!before)operation={kind:'set',value};
  else{const patch=diffProduct(before,value);if(Object.keys(patch).length)operation={kind:'update',patch};}
  if(operation)changes.set(id,mergePending(changes.get(id)||pending.get(id),operation));
 }
 for(const id of displayedItems.keys())if(!now.has(id))changes.set(id,{kind:'delete'});
 for(const [id,operation] of changes)pending.set(id,operation);
 const budgetChanged=budget!==displayedBudget;if(budgetChanged)pendingBudget=budget;
 const budgetToWrite=budgetChanged?budget:retryPending&&pendingBudget!==null?pendingBudget:null;
 displayedItems=now;displayedBudget=budget;
 if(!changes.size&&budgetToWrite===null)return;
 writeQueue=writeQueue.then(async()=>{
  if(target!==listId||gen!==generation)return;
  let failure=null;
  for(const [id,queued] of changes){
   if(target!==listId||gen!==generation)return;
   const operation=retryPending?pending.get(id):queued;if(!operation)continue;
   try{
    const ref=doc(db,'listas',target,'produtos',id);
    if(operation.kind==='delete')await deleteDoc(ref);
    else if(operation.kind==='set')await setDoc(ref,operation.value);
    else await updateDoc(ref,operation.patch);
    if(target!==listId||gen!==generation)return;
    applyOperationToRemote(id,operation);clearPending(id,operation);
   }catch(error){if(target!==listId||gen!==generation)return;failure??=error;}
  }
  if(target!==listId||gen!==generation)return;
  if(budgetToWrite!==null&&(!retryPending||pendingBudget!==null)){
   const writeBudget=retryPending?pendingBudget:budgetToWrite;
   try{await updateDoc(doc(db,'listas',target),{budget:writeBudget});if(target!==listId||gen!==generation)return;remoteBudget=writeBudget;if(pendingBudget===writeBudget)pendingBudget=null;}catch(error){if(target!==listId||gen!==generation)return;failure??=error;}
  }
  if(gen===generation){applyRemote();status(failure?'Erro ao salvar (alteração pendente neste aparelho): '+errorText(failure):'✓ Alterações salvas');}
 }).catch(error=>{if(gen===generation)status('Erro ao salvar (alteração pendente neste aparelho): '+errorText(error))});
}
window.addEventListener('shopping-local-change',()=>queueWrite());
window.addEventListener('online',()=>queueWrite(true));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')queueWrite(true)});
$('createShared').onclick=async()=>{if(!uid)return status('Aguarde a autenticação.');if(listId&&!confirm('Criar outra lista compartilhada? A atual continuará existindo.'))return;
 try{const id=randomCode(),batch=writeBatch(db);batch.set(doc(db,'listas',id),{ownerId:uid,budget:bridge.getBudget(),createdAt:serverTimestamp()});batch.set(doc(db,'listas',id,'membros',uid),{uid,joinedAt:serverTimestamp(),role:'owner'});
 for(const item of bridge.getItems())batch.set(doc(db,'listas',id,'produtos',item.id),plain(item));await batch.commit();await connect(id);await createInvite();}catch(e){status('Erro ao criar: '+errorText(e))}};
async function createInvite(){if(!listId||!uid)return;try{const code=randomCode(),expiresAt=Date.now()+86400000;await setDoc(doc(db,'convites',code),{listId,createdBy:uid,expiresAt,createdAt:serverTimestamp()});$('inviteCode').value=code;$('qrArea').classList.add('hidden');$('inviteArea').classList.remove('hidden');status('Novo convite gerado (válido por 24 horas).');}catch(e){status('Erro ao gerar convite: '+errorText(e))}}
$('generateInvite').onclick=()=>createInvite();
$('joinShared').onclick=()=>{const code=prompt('Cole o código de convite recebido:');if(code)joinByCode(code);};
$('copyInvite').onclick=async()=>{try{await navigator.clipboard.writeText($('inviteCode').value);status('Convite copiado. Envie à outra pessoa em particular.')}catch{prompt('Copie o código:',$('inviteCode').value)}};
$('leaveShared').onclick=()=>{if(!confirm('Desconectar este aparelho da lista?'))return;disconnect();localStorage.removeItem('shared-list-id');status('Modo local. Seus dados locais continuam neste aparelho.')};
onAuthStateChanged(auth,async user=>{if(!user)return;uid=user.uid;if(inviteFromUrl){if(confirm('Deseja entrar nesta lista de compras compartilhada?'))await joinByCode(inviteFromUrl);return;}const id=localStorage.getItem('shared-list-id');if(id){try{const member=await getDoc(doc(db,'listas',id,'membros',uid));if(member.exists())await connect(id);else status('Acesso à lista não encontrado. Crie uma lista ou entre com convite.')}catch(e){status(errorText(e))}}else status('Pronto. Crie uma lista compartilhada ou entre com convite.')});
// Process invitation links only after anonymous authentication has a stable UID.
if(!auth.currentUser)signInAnonymously(auth).catch(e=>status('Falha na autenticação: '+errorText(e)));
