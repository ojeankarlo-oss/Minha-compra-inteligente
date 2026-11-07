import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,signInAnonymously,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,doc,collection,getDoc,setDoc,deleteDoc,writeBatch,onSnapshot,serverTimestamp,updateDoc} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
const app=initializeApp({apiKey:'AIzaSyBdsFC8U2IkeeIQUIzg18MPajN808uPmyQ',authDomain:'minha-compra-inteligente.firebaseapp.com',projectId:'minha-compra-inteligente',storageBucket:'minha-compra-inteligente.firebasestorage.app',messagingSenderId:'978258885612',appId:'1:978258885612:web:c5f7f316f3d1f9b92bdec9'});
const auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id),bridge=window.shoppingBridge;
let uid=null,listId=null,unsubItems=null,unsubList=null,remoteItems=new Map(),remoteBudget=0,ready=false,applying=false;
let displayedItems=new Map(),displayedBudget=0,pending=new Map(),pendingBudget=null,writeQueue=Promise.resolve(),generation=0;
const status=t=>{$('syncStatus').textContent=t};
const randomCode=(bytes=16)=>Array.from(crypto.getRandomValues(new Uint8Array(bytes)),x=>x.toString(16).padStart(2,'0')).join('');
const errorText=e=>`${e.code||'Erro'}: ${e.message||e}`;
const plain=x=>({id:x.id,name:x.name,pack:x.pack,dept:x.dept,qty:Number(x.qty),price:Number(x.price),selected:!!x.selected,done:!!x.done});
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function disconnect(){generation++;unsubItems?.();unsubList?.();unsubItems=unsubList=null;ready=false;remoteItems.clear();pending.clear();pendingBudget=null;displayedItems.clear();listId=null;$('inviteArea').classList.add('hidden');$('leaveShared').classList.add('hidden');}
function applyRemote(){if(!ready)return;const combined=new Map(remoteItems);for(const [id,value] of pending){if(value===null)combined.delete(id);else combined.set(id,value)};
 const nextBudget=pendingBudget===null?remoteBudget:pendingBudget;applying=true;try{bridge.apply([...combined.values()].sort((a,b)=>(a.name||'').localeCompare(b.name||'','pt-BR')),nextBudget);displayedItems=new Map(combined);displayedBudget=nextBudget;}finally{applying=false}}
async function connect(id){disconnect();const gen=generation;listId=id;localStorage.setItem('shared-list-id',id);$('leaveShared').classList.remove('hidden');status('Sincronizando lista...');
 unsubList=onSnapshot(doc(db,'listas',id),snap=>{if(gen!==generation)return;if(!snap.exists()){status('Lista indisponível.');return}remoteBudget=Number(snap.data().budget||0);applyRemote()},e=>{if(gen===generation)status('Erro na lista: '+errorText(e))});
 unsubItems=onSnapshot(collection(db,'listas',id,'produtos'),snap=>{if(gen!==generation)return;remoteItems=new Map(snap.docs.map(d=>[d.id,plain({...d.data(),id:d.id})]));ready=true;applyRemote();status('✓ Sincronizado — alterações aparecem nos dois celulares');},e=>{if(gen===generation)status('Erro de sincronização: '+errorText(e))});
}
function queueWrite(){if(applying||!listId||!ready||!uid)return;
 const target=listId,gen=generation,now=new Map(bridge.getItems().map(i=>[i.id,plain(i)])),budget=bridge.getBudget();
 const changes=[];for(const [id,value] of now)if(!equal(displayedItems.get(id),value))changes.push([id,value]);
 for(const id of displayedItems.keys())if(!now.has(id))changes.push([id,null]);
 for(const [id,value] of changes)pending.set(id,value);
 const budgetChanged=budget!==displayedBudget;if(budgetChanged)pendingBudget=budget;
 displayedItems=now;displayedBudget=budget;
 if(!changes.length&&!budgetChanged)return;
 // Each action changes only its own product documents, never rewrites the entire remote collection.
 writeQueue=writeQueue.then(async()=>{if(target!==listId||gen!==generation)return;
  for(const [id,value] of changes){if(target!==listId||gen!==generation)return;
   if(value===null)await deleteDoc(doc(db,'listas',target,'produtos',id));else await setDoc(doc(db,'listas',target,'produtos',id),value);
   if(equal(pending.get(id),value))pending.delete(id);
  }
  if(budgetChanged){await updateDoc(doc(db,'listas',target),{budget});if(pendingBudget===budget)pendingBudget=null;}
  if(gen===generation){applyRemote();status('✓ Alterações salvas');}
 }).catch(e=>{if(gen===generation)status('Erro ao salvar (alteração pendente neste aparelho): '+errorText(e))});
}
window.addEventListener('shopping-local-change',queueWrite);
$('createShared').onclick=async()=>{if(!uid)return status('Aguarde a autenticação.');if(listId&&!confirm('Criar outra lista compartilhada? A atual continuará existindo.'))return;
 try{const id=randomCode(),batch=writeBatch(db);batch.set(doc(db,'listas',id),{ownerId:uid,budget:bridge.getBudget(),createdAt:serverTimestamp()});batch.set(doc(db,'listas',id,'membros',uid),{uid,joinedAt:serverTimestamp(),role:'owner'});
 for(const item of bridge.getItems())batch.set(doc(db,'listas',id,'produtos',item.id),plain(item));await batch.commit();await connect(id);await createInvite();}catch(e){status('Erro ao criar: '+errorText(e))}};
async function createInvite(){if(!listId||!uid)return;try{const code=randomCode(),expiresAt=Date.now()+86400000;await setDoc(doc(db,'convites',code),{listId,createdBy:uid,expiresAt,createdAt:serverTimestamp()});$('inviteCode').value=code;$('inviteArea').classList.remove('hidden');}catch(e){status('Erro ao gerar convite: '+errorText(e))}}
$('joinShared').onclick=async()=>{if(!uid)return status('Aguarde a autenticação.');const code=prompt('Cole o código de convite recebido:')?.trim().toLowerCase();if(!code)return;if(!/^[a-f0-9]{32}$/.test(code))return status('Código inválido.');
 try{const invite=await getDoc(doc(db,'convites',code));if(!invite.exists())throw Error('Convite não encontrado');const data=invite.data();if(data.expiresAt<Date.now())throw Error('Convite expirado');await setDoc(doc(db,'listas',data.listId,'membros',uid),{uid,role:'member',inviteCode:code,joinedAt:serverTimestamp()});await connect(data.listId);}catch(e){status('Não foi possível entrar: '+errorText(e))}};
$('copyInvite').onclick=async()=>{try{await navigator.clipboard.writeText($('inviteCode').value);status('Convite copiado. Envie à outra pessoa em particular.')}catch{prompt('Copie o código:',$('inviteCode').value)}};
$('leaveShared').onclick=()=>{if(!confirm('Desconectar este aparelho da lista?'))return;disconnect();localStorage.removeItem('shared-list-id');status('Modo local. Seus dados locais continuam neste aparelho.')};
onAuthStateChanged(auth,async user=>{if(!user)return;uid=user.uid;const id=localStorage.getItem('shared-list-id');if(id){try{const member=await getDoc(doc(db,'listas',id,'membros',uid));if(member.exists())await connect(id);else status('Acesso à lista não encontrado. Crie uma lista ou entre com convite.')}catch(e){status(errorText(e))}}else status('Pronto. Crie uma lista compartilhada ou entre com convite.')});
if(!auth.currentUser)signInAnonymously(auth).catch(e=>status('Falha na autenticação: '+errorText(e)));
