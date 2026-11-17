// Staander MVP: biblioteca de PDFs e projetos publicados, leitor, notas, busca, Studio, Meu Espaço e Painel Admin.
const $=id=>document.getElementById(id);
const TOKEN_KEY="staander_token",USER_KEY="staander_user";
let importedBooks=[],apiItems=[],apiNotes=[],currentBook=null,editingStudioId="",selectedPublishId="",publishCoverData="",publishStep=1;
let currentUser=null,adminData=null,selectedAdminUserId="";

function apiFetch(url,options={}){
 const token=localStorage.getItem(TOKEN_KEY);
 const headers=new Headers(options.headers||{});
 if(token)headers.set("Authorization","Bearer "+token);
 return fetch(url,{...options,headers});
}
function authHeaders(){
 const token=localStorage.getItem(TOKEN_KEY);
 return token?{Authorization:"Bearer "+token}:{};
}
function userInitials(name){
 const parts=String(name||"Usuário").trim().split(/\s+/).filter(Boolean);
 if(parts.length===0)return "US";
 if(parts.length===1)return parts[0].slice(0,2).toUpperCase();
 return (parts[0][0]+parts[parts.length-1][0]).toUpperCase();
}

// ---------- utilidades ----------
function esc(value){
 return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function norm(value){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()}
function itemById(id){return apiItems.find(i=>i.id===id)}
function itemTitle(id){const item=itemById(id);return item?item.titulo:"Arquivo removido"}
function isTextItem(item){return !!(item&&(item.tipo==="TXT"||typeof item.conteudo==="string"||/\.txt$/i.test(item.arquivo||"")))}
function isLibraryItem(item){
 if(!item)return false;
 if(isTextItem(item))return item.naBiblioteca===true;
 return !!(item.arquivo&&item.naBiblioteca!==false);
}
function studioProjects(){return [...apiItems].filter(isTextItem).reverse()}
function publishableItems(){return [...apiItems].filter(i=>i.arquivo||isTextItem(i)).reverse()}
function pageLabel(value){const v=String(value||"").trim();return /^\d+$/.test(v)?"Página "+v:v}
function formatDate(iso){const d=new Date(iso);return isNaN(d)?"":d.toLocaleDateString("pt-BR")}
function timeAgo(iso){
 const seconds=(Date.now()-new Date(iso).getTime())/1000;
 if(isNaN(seconds))return "";
 if(seconds<60)return "agora";
 if(seconds<3600)return "há "+Math.floor(seconds/60)+" min";
 if(seconds<86400)return "há "+Math.floor(seconds/3600)+" h";
 if(seconds<172800)return "ontem";
 if(seconds<2592000)return "há "+Math.floor(seconds/86400)+" dias";
 return formatDate(iso);
}
function coverColor(title){let h=0;for(const c of title)h=(h*31+c.charCodeAt(0))%90;return `hsl(${255+h} 22% 26%)`}
function progressOf(item){
 const total=item.totalPaginas||0,max=Math.min(item.maxPagina||0,total||Infinity);
 return {total,max,percent:total?Math.min(100,Math.round(max/total*100)):0};
}
function toast(t){const x=$("toast");x.textContent=t;x.classList.add("show");setTimeout(()=>x.classList.remove("show"),2400)}
// ---------- navegação ----------
function openPage(id){
 if(id==="admin"&&(!currentUser||currentUser.role!=="admin")){
  toast("Acesso restrito a administradores.");
  return;
 }
 if(id!=="reader")saveProgress();
 document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
 $(id).classList.add("active");
 document.querySelectorAll(".nav").forEach(n=>n.classList.toggle("active",n.dataset.page===id));
 window.scrollTo({top:0,behavior:"smooth"});
 if(id==="home")renderHome();
 if(id==="library")renderLibrary();
 if(id==="notes")renderNotes();
 if(id==="search")runSearch();
 if(id==="studio")renderStudio();
 if(id==="publish")renderPublish();
 if(id==="settings")renderUserProfile();
 if(id==="admin")loadAdminOverview();
}
function openReaderFromNav(){
 if(currentBook){
  openPage("reader");
  if(reading.ready)scrollToPage(reading.current);
  return;
 }
 const last=lastOpened();
 if(last)openReader(last.titulo,last.id);else openPage("reader");
}
function lastOpened(){
 return importedBooks.filter(i=>i.ultimaLeituraEm).sort((a,b)=>new Date(b.ultimaLeituraEm)-new Date(a.ultimaLeituraEm))[0];
}
document.querySelectorAll(".nav").forEach(n=>n.onclick=()=>n.dataset.page==="reader"?openReaderFromNav():openPage(n.dataset.page));
function toggleSidebar(){document.querySelector(".sidebar").classList.toggle("open")}
function togglePanel(id){const el=$(id);el.style.display=el.style.display==="none"?"block":"none"}
function newProject(){startNewStudioProject()}
function openProject(name){toast("Abrindo projeto: "+name)}

// cliques delegados: abrir arquivo, excluir arquivo/nota, editar projeto em Projetos, selecionar no Publish
document.addEventListener("click",e=>{
 const delFile=e.target.closest("[data-delete]");
 if(delFile){deleteItem(delFile.dataset.delete);return}
 const delNote=e.target.closest("[data-delete-note]");
 if(delNote){deleteNote(delNote.dataset.deleteNote);return}
 const editProj=e.target.closest("[data-edit-project]");
 if(editProj){openStudioProjectForEdit(editProj.dataset.editProject);return}
 const pubSelect=e.target.closest("[data-publish-id]");
 if(pubSelect){selectPublishFile(pubSelect.dataset.publishId);return}
 const editPub=e.target.closest("[data-edit-publish]");
 if(editPub){openInPublish(editPub.dataset.editPublish);return}
 const admUser=e.target.closest("[data-admin-user]");
 if(admUser){selectAdminUser(admUser.dataset.adminUser);return}
 const card=e.target.closest("[data-id][data-title]");
 if(card){openReader(card.dataset.title,card.dataset.id,card.dataset.page?Number(card.dataset.page):undefined);return}
 const jump=e.target.closest(".mini-note[data-page]");
 if(jump&&reading.ready)scrollToPage(Number(jump.dataset.page));
});

// ---------- dados ----------
async function loadData(){
 try{
  const responses=await Promise.all([apiFetch("/api/items"),apiFetch("/api/notes")]);
  if(responses.some(response=>!response.ok))throw new Error("A API retornou um erro.");
  const [items,notesData]=await Promise.all(responses.map(response=>response.json()));
  apiItems=items;
  apiNotes=notesData;
  importedBooks=items.filter(isLibraryItem).reverse(); // mais recentes primeiro
 }catch(error){
  apiItems=[];apiNotes=[];importedBooks=[];
 }
 if(editingStudioId&&!itemById(editingStudioId))editingStudioId="";
 if(selectedPublishId&&!itemById(selectedPublishId))selectedPublishId="";
 renderHome(); renderLibrary(); renderNotes(); renderStudio(); renderPublish(); renderUserProfile();
 if($("search").classList.contains("active"))runSearch();
 if($("admin")?.classList.contains("active"))loadAdminOverview();
 if(currentBook)renderReaderNotes();
}

// ---------- visão geral ----------
function renderHome(){
 $("bookCount").textContent=importedBooks.length;
 $("inProgressCount").textContent=importedBooks.filter(i=>i.status==="em_leitura").length;
 const withTotal=importedBooks.filter(i=>i.totalPaginas>0);
 const read=withTotal.reduce((sum,i)=>sum+Math.min(i.maxPagina||0,i.totalPaginas),0);
 const total=withTotal.reduce((sum,i)=>sum+i.totalPaginas,0);
 $("totalProgress").textContent=total?Math.round(read/total*100)+"%":"—";
 $("noteCount").textContent=apiNotes.length;
 renderContinue(); renderActivity(); renderBooks();
}
function renderContinue(){
 const opened=importedBooks.filter(i=>i.ultimaLeituraEm).sort((a,b)=>new Date(b.ultimaLeituraEm)-new Date(a.ultimaLeituraEm)).slice(0,3);
 if(opened.length===0){
  $("continueList").innerHTML='<p class="muted empty">Você ainda não abriu nenhum arquivo. Importe um PDF ou publique um projeto para começar a ler.</p>';
  return;
 }
 $("continueList").innerHTML=opened.map(item=>{
  const p=progressOf(item);
  const coverInner=item.capa
   ?`<img class="cover-img" src="${esc(item.capa)}" alt="${esc(item.titulo)}">`
   :item.titulo.toUpperCase().split(/\s+/).slice(0,3).map(esc).join("<br>");
  return `<div class="reading-card" data-title="${esc(item.titulo)}" data-id="${esc(item.id)}"><div class="cover" style="background:${coverColor(item.titulo)}">${coverInner}</div><div class="reading-info"><h3>${esc(item.titulo)}</h3><p class="muted">${item.paginaAtual?"Parou na página "+item.paginaAtual:"Ainda não avançou"}</p><div class="bar"><i style="width:${p.percent}%"></i></div><small>${p.percent}% · ${p.max} / ${p.total||"?"} páginas</small></div><b class="play">▶</b></div>`;
 }).join("");
}
function renderActivity(){
 const recent=[...apiNotes].sort((a,b)=>new Date(b.criadoEm)-new Date(a.criadoEm)).slice(0,4);
 if(recent.length===0){
  $("activityList").innerHTML='<p class="muted empty">Nenhuma atividade ainda. As últimas notas que você criar aparecem aqui.</p>';
  return;
 }
 $("activityList").innerHTML=recent.map(n=>{
  const text=n.conteudo.length>70?n.conteudo.slice(0,70)+"…":n.conteudo;
  return `<div class="activity"><span class="dot purple"></span><div><b>Nova nota criada</b><p>“${esc(text)}” · ${esc(itemTitle(n.itemId))}</p><small>${esc(timeAgo(n.criadoEm))}</small></div></div>`;
 }).join("");
}

// ---------- biblioteca ----------
function bookSubtitle(item){
 if(isTextItem(item))return "TXT · "+(item.tamanho||"1 KB");
 return "PDF · "+item.tamanho+(item.totalPaginas?" · "+item.totalPaginas+" págs.":"");
}
function bookCard(item){
 const coverContent=item.capa
  ?`<img class="book-cover-img" src="${esc(item.capa)}" alt="Capa de ${esc(item.titulo)}">`
  :esc(item.titulo.toUpperCase());
 const desc=item.descricao?`<div class="book-desc" title="${esc(item.descricao)}">${esc(item.descricao)}</div>`:"";
 return `<div class="book" data-title="${esc(item.titulo)}" data-id="${esc(item.id)}"><button type="button" class="book-delete" data-delete="${esc(item.id)}" title="Excluir arquivo" aria-label="Excluir ${esc(item.titulo)}">🗑</button><div class="book-cover${item.capa?" has-image":""}" style="background:${coverColor(item.titulo)}">${coverContent}</div><div class="book-title">${esc(item.titulo)}</div><div class="book-author">${esc(bookSubtitle(item))}</div>${desc}</div>`;
}
function renderBooks(target="recentGrid",limit=6){
 const el=$(target); if(!el)return;
 if(importedBooks.length===0){
  el.innerHTML='<p class="muted empty">Nenhum arquivo ainda. Importe um PDF ou publique um projeto do Studio.</p>';
  return;
 }
 el.innerHTML=importedBooks.slice(0,limit).map(bookCard).join("");
}
function renderLibrary(){
 const q=norm($("libraryFilter")?.value||"");
 const list=importedBooks.filter(b=>norm(b.titulo).includes(q)||norm(b.descricao).includes(q));
 if(list.length===0){
  $("libraryGrid").innerHTML=importedBooks.length===0
   ?'<p class="muted empty">Sua biblioteca está vazia. Importe um PDF ou publique um projeto na aba Publish.</p>'
   :'<p class="muted empty">Nenhum arquivo corresponde ao filtro.</p>';
  return;
 }
 $("libraryGrid").innerHTML=list.map(bookCard).join("");
}

// ---------- notas ----------
function renderNotes(){
 const el=$("notesList");
 if(apiNotes.length===0){
  el.innerHTML='<p class="muted empty">Nenhuma nota ainda. Clique em “Nova nota” para criar a primeira.</p>';
  return;
 }
 el.innerHTML=[...apiNotes].reverse().map(n=>`<div class="note-row"><div class="note-row-head"><b>${esc(pageLabel(n.posicao)||"Nota")}</b><button type="button" class="note-delete" data-delete-note="${esc(n.id)}" aria-label="Excluir nota">Excluir</button></div><p>${esc(n.conteudo)}</p><small>${esc(itemTitle(n.itemId))} · ${esc(formatDate(n.criadoEm))}</small></div>`).join("");
}
function setNoteError(message){$("noteError").textContent=message}
// Abre o formulário. Com "book" (vindo do leitor), a nota fica presa ao arquivo aberto.
function openNoteModal(book){
 if(importedBooks.length===0){toast("Importe um arquivo antes de criar notas.");return}
 const select=$("noteItem");
 select.innerHTML=importedBooks.map(b=>`<option value="${esc(b.id)}">${esc(b.titulo)}</option>`).join("");
 const locked=!!(book&&book.id&&importedBooks.some(b=>b.id===book.id));
 if(locked)select.value=book.id;
 select.disabled=locked;
 $("notePage").value=locked&&reading.ready?String(reading.current):"";
 $("noteText").value="";
 $("noteModalTitle").textContent=locked?"Nova nota neste arquivo":"Nova nota";
 setNoteError("");
 $("noteModal").classList.remove("hidden");
 setTimeout(()=>$("noteText").focus(),30);
}
function openNoteFromReader(){
 if(!currentBook){toast("Abra um arquivo para criar uma nota nele.");return}
 openNoteModal(currentBook);
}
function closeNoteModal(){$("noteModal").classList.add("hidden")}
async function saveNote(event){
 event.preventDefault();
 const itemId=$("noteItem").value;
 const conteudo=$("noteText").value.trim();
 const posicao=$("notePage").value.trim();
 if(!itemId){setNoteError("Selecione o arquivo da nota.");return}
 if(!conteudo){setNoteError("Escreva a descrição da nota.");$("noteText").focus();return}
 const total=(itemById(itemId)||{}).totalPaginas;
 if(/^\d+$/.test(posicao)&&total&&Number(posicao)>total){setNoteError("Este arquivo tem "+total+" páginas.");return}
 const button=$("noteSave");
 button.disabled=true;
 setNoteError("");
 try{
  const response=await apiFetch("/api/notes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({itemId,conteudo,posicao})});
  if(!response.ok)throw new Error("Erro "+response.status);
  closeNoteModal();
  await loadData();
  toast("Nota criada.");
 }catch(error){
  setNoteError(error&&error.name==="TypeError"?"Não foi possível falar com a API. Verifique se ela está em execução.":"Não foi possível salvar a nota. "+error.message);
 }finally{
  button.disabled=false;
 }
}
$("noteForm").addEventListener("submit",saveNote);

// painel de notas do leitor
function renderReaderNotes(){
 const container=$("readerNotesList");
 if(!currentBook){
  container.replaceChildren(textLine("Abra um arquivo para ver as notas dele."));
  return;
 }
 const related=apiNotes.filter(n=>n.itemId===currentBook.id).sort((a,b)=>{
  const pa=/^\d+$/.test(a.posicao||"")?Number(a.posicao):Infinity,pb=/^\d+$/.test(b.posicao||"")?Number(b.posicao):Infinity;
  return pa-pb||new Date(a.criadoEm)-new Date(b.criadoEm);
 });
 if(related.length===0){container.replaceChildren(textLine("Nenhuma nota neste arquivo ainda."));return}
 container.replaceChildren(...related.map(createReaderNote));
}
function textLine(message){const p=document.createElement("p");p.className="muted";p.textContent=message;return p}
function createReaderNote(note){
 const card=document.createElement("div");
 card.className="mini-note";
 if(/^\d+$/.test(note.posicao||""))card.dataset.page=note.posicao;
 const head=document.createElement("div");head.className="mini-note-head";
 const heading=document.createElement("b");heading.textContent=pageLabel(note.posicao)||"Nota";
 const del=document.createElement("button");del.type="button";del.className="note-delete";del.textContent="Excluir";del.dataset.deleteNote=note.id;del.setAttribute("aria-label","Excluir nota");
 head.append(heading,del);
 const content=document.createElement("p");content.textContent=note.conteudo;
 const date=document.createElement("small");date.textContent=formatDate(note.criadoEm);
 card.append(head,content,date);
 return card;
}

// ---------- exclusão ----------
let confirmResolver=null;
function askConfirm(title,message,okLabel){
 return new Promise(resolve=>{
  confirmResolver=resolve;
  $("confirmTitle").textContent=title;
  $("confirmMessage").textContent=message;
  $("confirmOk").textContent=okLabel||"Excluir";
  $("confirmModal").classList.remove("hidden");
  $("confirmCancel").focus();
 });
}
function closeConfirm(result){
 $("confirmModal").classList.add("hidden");
 if(confirmResolver){const resolve=confirmResolver;confirmResolver=null;resolve(result)}
}
$("confirmOk").addEventListener("click",()=>closeConfirm(true));
$("confirmCancel").addEventListener("click",()=>closeConfirm(false));
async function deleteRequest(path){
 try{
  const response=await apiFetch(path,{method:"DELETE"});
  if(!response.ok)throw new Error("Erro "+response.status);
  return true;
 }catch(error){
  toast(error&&error.name==="TypeError"?"Não foi possível falar com a API. Verifique se ela está em execução.":"Não foi possível excluir. "+error.message);
  return false;
 }
}
async function deleteItem(id){
 const item=itemById(id); if(!item)return;
 const count=apiNotes.filter(n=>n.itemId===id).length;
 const extra=count?" As "+count+(count===1?" nota":" notas")+" dele também "+(count===1?"será removida":"serão removidas")+".":"";
 const ok=await askConfirm("Excluir “"+item.titulo+"”?","O arquivo será removido da sua biblioteca.%s Essa ação não pode ser desfeita.".replace("%s",extra));
 if(!ok)return;
 if(!await deleteRequest("/api/items/"+encodeURIComponent(id)))return;
 if(currentBook&&currentBook.id===id)resetReader();
 await loadData();
 toast("Arquivo excluído.");
}
async function deleteNote(id){
 const note=apiNotes.find(n=>n.id===id); if(!note)return;
 const text=note.conteudo.length>80?note.conteudo.slice(0,80)+"…":note.conteudo;
 const ok=await askConfirm("Excluir esta nota?","“"+text+"” Essa ação não pode ser desfeita.");
 if(!ok)return;
 if(!await deleteRequest("/api/notes/"+encodeURIComponent(id)))return;
 await loadData();
 toast("Nota excluída.");
}

// ---------- leitor (pdf.js) ----------
const reading={token:0,pdf:null,task:null,id:"",total:0,current:1,max:0,ready:false,dirty:false,pages:[],observer:null,saveTimer:null,raf:0};
let pdfjsPromise=null;
function loadPdfjs(){
 if(!pdfjsPromise){
  pdfjsPromise=import("./vendor/pdfjs/pdf.min.mjs").then(lib=>{
   lib.GlobalWorkerOptions.workerSrc=new URL("vendor/pdfjs/pdf.worker.min.mjs",location.href).href;
   return lib;
  }).catch(error=>{pdfjsPromise=null;throw error});
 }
 return pdfjsPromise;
}
const asset=path=>new URL("vendor/pdfjs/"+path,location.href).href;

function showReaderMessage(message,showButton){
 $("readerPages").hidden=true;
 $("readerBottom").hidden=true;
 $("readerEmpty").hidden=false;
 $("readerEmptyText").textContent=message;
 $("readerEmptyBtn").hidden=!showButton;
}
function resetReader(){
 closeReading();
 currentBook=null;
 $("readerTitle").textContent="Nenhum arquivo aberto";
 $("readerOpenTab").hidden=true;
 showReaderMessage("Nenhum arquivo aberto. Escolha um PDF da sua biblioteca para começar a ler.",true);
 renderReaderNotes();
}
function closeReading(){
 saveProgress();
 reading.token++;
 reading.ready=false;
 if(reading.observer){reading.observer.disconnect();reading.observer=null}
 if(reading.task){try{reading.task.destroy()}catch(e){}reading.task=null}
 reading.pdf=null;reading.id="";reading.total=0;reading.pages=[];
 $("readerPages").replaceChildren();
}
async function openReader(title,id,page){
 const item=itemById(id);
 if(!item)return;
 if(reading.id===id&&reading.ready&&!isTextItem(item)){
  openPage("reader");
  scrollToPage(page||reading.current);
  return;
 }
 currentBook={title:item.titulo,id};
 $("readerTitle").textContent=item.titulo;
 $("readerOpenTab").href="/api/items/"+encodeURIComponent(id)+"/arquivo";
 $("readerOpenTab").hidden=false;
 openPage("reader");
 renderReaderNotes();
 await startReading(item,page);
}
 $("readerOpenTab").addEventListener("click",async event=>{
  event.preventDefault();
  const tab=window.open("about:blank","_blank");
  if(!tab){toast("Permita pop-ups para abrir o arquivo em outra aba.");return}
  try{
   const response=await apiFetch($("readerOpenTab").href);
   if(!response.ok)throw new Error("Erro "+response.status);
   const url=URL.createObjectURL(await response.blob());
   tab.location.href=url;
   setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(error){
   tab.close();
   toast("Não foi possível abrir o arquivo. "+error.message);
  }
 });
async function startReading(item,forcePage){
 closeReading();
 const token=++reading.token;
 if(isTextItem(item)){
  const holder=$("readerPages");
  const paper=document.createElement("article");
  paper.className="paper text-reader-paper";
  const meta=document.createElement("div");
  meta.className="paper-meta";
  meta.textContent="ARQUIVO DE TEXTO · "+(item.tamanho||"1 KB");
  const h1=document.createElement("h1");
  h1.textContent=item.titulo;
  paper.append(meta,h1);
  if(item.descricao){
   const desc=document.createElement("blockquote");
   desc.textContent=item.descricao;
   paper.append(desc);
  }
  const body=document.createElement("div");
  body.className="paper-text-content";
  body.textContent=item.conteudo||"";
  paper.append(body);
  holder.replaceChildren(paper);
  $("readerEmpty").hidden=true;
  holder.hidden=false;
  $("readerBottom").hidden=false;
  reading.id=item.id;
  reading.total=1;
  reading.current=1;
  reading.max=1;
  reading.ready=true;
  updateReaderBar();
  reading.dirty=true;
  saveProgress();
  return;
 }
 showReaderMessage("Carregando arquivo...",false);
 try{
  const lib=await loadPdfjs();
  const task=lib.getDocument({url:"/api/items/"+encodeURIComponent(item.id)+"/arquivo",httpHeaders:authHeaders(),cMapUrl:asset("cmaps/"),cMapPacked:true,standardFontDataUrl:asset("standard_fonts/"),wasmUrl:asset("wasm/"),isEvalSupported:false});
  reading.task=task;
  const pdf=await task.promise;
  if(token!==reading.token){pdf.destroy();return}
  const first=await pdf.getPage(1);
  if(token!==reading.token)return;
  const base=first.getViewport({scale:1});
  reading.pdf=pdf;reading.id=item.id;reading.total=pdf.numPages;
  reading.max=Math.min(item.maxPagina||0,reading.total);
  const holder=$("readerPages");
  reading.pages=[];
  const fragment=document.createDocumentFragment();
  for(let n=1;n<=reading.total;n++){
   const div=document.createElement("div");
   div.className="pdf-page";
   div.dataset.page=String(n);
   div.style.aspectRatio=base.width+" / "+base.height;
   reading.pages.push(div);
   fragment.append(div);
  }
  holder.replaceChildren(fragment);
  $("readerEmpty").hidden=true;
  holder.hidden=false;
  $("readerBottom").hidden=false;
  reading.observer=new IntersectionObserver(entries=>{
   for(const entry of entries){
    const n=Number(entry.target.dataset.page);
    if(entry.isIntersecting)renderPage(n,token);else releasePage(n);
   }
  },{rootMargin:"1400px 0px"});
  reading.pages.forEach(div=>reading.observer.observe(div));
  const target=Math.min(Math.max(1,forcePage||item.paginaAtual||1),reading.total);
  reading.current=target;
  updateReaderBar();
  scrollToPage(target);
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  if(token!==reading.token)return;
  reading.ready=true;
  reading.max=Math.max(reading.max,target);
  updateReaderBar();
  reading.dirty=true;
  saveProgress();
 }catch(error){
  if(token!==reading.token)return;
  console.error("Não foi possível abrir o PDF:",error);
  showReaderMessage(error&&error.name==="MissingPDFException"?"O arquivo não foi encontrado no servidor.":"Não foi possível abrir este PDF. Ele pode estar protegido ou corrompido.",true);
 }
}
async function renderPage(n,token){
 const holder=reading.pages[n-1];
 if(!holder||holder.dataset.state==="rendering"||holder.dataset.state==="done")return;
 holder.dataset.state="rendering";
 holder.classList.add("loading");
 try{
  const page=await reading.pdf.getPage(n);
  if(token!==reading.token||holder.dataset.state!=="rendering")return;
  const base=page.getViewport({scale:1});
  holder.style.aspectRatio=base.width+" / "+base.height;
  const cssWidth=holder.clientWidth||base.width;
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const viewport=page.getViewport({scale:cssWidth/base.width*dpr});
  const canvas=document.createElement("canvas");
  canvas.width=Math.floor(viewport.width);
  canvas.height=Math.floor(viewport.height);
  const task=page.render({canvas,viewport});
  holder.renderTask=task;
  await task.promise;
  if(token!==reading.token||holder.dataset.state!=="rendering")return;
  holder.replaceChildren(canvas);
  holder.dataset.state="done";
  holder.classList.remove("loading");
 }catch(error){
  if(error&&error.name==="RenderingCancelledException")return;
  holder.dataset.state="";
  holder.classList.remove("loading");
 }
}
function releasePage(n){
 const holder=reading.pages[n-1];
 if(!holder||!holder.dataset.state)return;
 if(holder.renderTask){try{holder.renderTask.cancel()}catch(e){}holder.renderTask=null}
 holder.replaceChildren();
 holder.dataset.state="";
 holder.classList.remove("loading");
}
function scrollToPage(n){
 const page=Math.min(Math.max(1,n),reading.total);
 if(page===1){window.scrollTo({top:0,behavior:"instant"});return}
 const holder=reading.pages[page-1];
 if(holder)holder.scrollIntoView({block:"start",behavior:"instant"});
}
function updateReaderBar(){
 const percent=reading.total?Math.min(100,Math.round(reading.max/reading.total*100)):0;
 $("readerPageLabel").textContent=reading.current+" / "+reading.total;
 $("readerProgressBar").style.width=percent+"%";
 $("readerPercent").textContent=percent+"%";
}
function updateCurrentPage(){
 if(!reading.ready||!reading.total||reading.pages.length===0||!$("reader").classList.contains("active"))return;
 const probe=128+(window.innerHeight-173)*0.35;
 let lo=0,hi=reading.pages.length-1,found=0;
 while(lo<=hi){
  const mid=(lo+hi)>>1;
  if(reading.pages[mid].getBoundingClientRect().top<=probe){found=mid;lo=mid+1}else hi=mid-1;
 }
 let n=found+1;
 if(window.innerHeight+window.scrollY>=document.documentElement.scrollHeight-2)n=reading.total; // fim do documento
 if(n===reading.current)return;
 reading.current=n;
 reading.max=Math.max(reading.max,n);
 reading.dirty=true;
 updateReaderBar();
 clearTimeout(reading.saveTimer);
 reading.saveTimer=setTimeout(()=>saveProgress(),1200);
}
window.addEventListener("scroll",()=>{
 if(reading.raf)return;
 reading.raf=requestAnimationFrame(()=>{reading.raf=0;updateCurrentPage()});
},{passive:true});
async function saveProgress(keepalive){
 clearTimeout(reading.saveTimer);
 if(!reading.id||!reading.total||!reading.dirty)return;
 reading.dirty=false;
 const item=itemById(reading.id);
 const body={paginaAtual:reading.current,maxPagina:reading.max,totalPaginas:reading.total,ultimaLeituraEm:new Date().toISOString()};
 body.status=reading.max>=reading.total?"lido":(item&&item.status==="lido"?"lido":"em_leitura");
 try{
  const response=await apiFetch("/api/items/"+encodeURIComponent(reading.id),{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),keepalive:!!keepalive});
  if(!response.ok)throw new Error("Erro "+response.status);
  const updated=await response.json();
  if(item)Object.assign(item,updated);
 }catch(error){
  reading.dirty=true; // tenta de novo na próxima mudança
  console.warn("Não foi possível salvar o progresso de leitura:",error);
 }
}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")saveProgress(true)});
window.addEventListener("pagehide",()=>saveProgress(true));

// ---------- studio: projetos (criar, salvar e reabrir rascunhos de texto simples) ----------
function setStudioFeedback(message,isError){
 const el=$("studioFeedback");
 if(!el)return;
 el.textContent=message||"";
 el.className="studio-feedback"+(message?(isError?" error":" success"):"");
}
function updateStudioEditorHeader(){
 const item=editingStudioId?itemById(editingStudioId):null;
 if($("studioEditorKicker"))$("studioEditorKicker").textContent=item?"EDITANDO PROJETO SALVO":"NOVO PROJETO";
 if($("studioEditorTitle"))$("studioEditorTitle").textContent=item?"Editando: "+item.titulo:"Editor de texto simples";
 if($("studioEditorStatus"))$("studioEditorStatus").textContent=item
  ?(item.naBiblioteca?"Publicado na Biblioteca · editável":"Rascunho salvo em Projetos")
  :"Modo criação · texto puro";
 if($("studioSaveBtn"))$("studioSaveBtn").textContent=item?"Salvar alterações em Projetos":"Salvar em Projetos";
}
function startNewStudioProject(){
 if(!$("studio").classList.contains("active"))openPage("studio");
 editingStudioId="";
 if($("studioFileTitle"))$("studioFileTitle").value="";
 if($("studioFileContent"))$("studioFileContent").value="";
 setStudioFeedback("");
 updateStudioEditorHeader();
 renderStudio();
 const panel=$("studioTextPanel");
 if(panel)panel.scrollIntoView({behavior:"smooth",block:"center"});
 setTimeout(()=>$("studioFileTitle")?.focus(),50);
}
function openStudioProjectForEdit(id){
 const item=itemById(id);
 if(!item)return;
 if(!$("studio").classList.contains("active"))openPage("studio");
 editingStudioId=item.id;
 if($("studioFileTitle"))$("studioFileTitle").value=item.titulo||"";
 if($("studioFileContent"))$("studioFileContent").value=typeof item.conteudo==="string"?item.conteudo:"";
 setStudioFeedback("Editando projeto “"+item.titulo+"”. Faça suas alterações e clique em Salvar.",false);
 updateStudioEditorHeader();
 renderStudio();
 const panel=$("studioTextPanel");
 if(panel)panel.scrollIntoView({behavior:"smooth",block:"center"});
 setTimeout(()=>$("studioFileContent")?.focus(),50);
}
async function saveStudioTextFile(event){
 event.preventDefault();
 const titleInput=$("studioFileTitle");
 const contentInput=$("studioFileContent");
 const titulo=(titleInput?.value||"").trim();
 const conteudo=contentInput?.value||"";
 if(!titulo){
  setStudioFeedback("Informe o título do projeto.",true);
  titleInput?.focus();
  return;
 }
 if(!conteudo.trim()){
  setStudioFeedback("Digite o conteúdo de texto do projeto.",true);
  contentInput?.focus();
  return;
 }
 const btn=$("studioSaveBtn");
 if(btn)btn.disabled=true;
 setStudioFeedback("");
 const isEditing=!!(editingStudioId&&itemById(editingStudioId));
 try{
  const url=isEditing?"/api/items/"+encodeURIComponent(editingStudioId):"/api/items";
  const method=isEditing?"PUT":"POST";
  const payload=isEditing
   ?{titulo,conteudo}
   :{titulo,conteudo,tipo:"TXT",status:"nao_lido",naBiblioteca:false};
  const response=await apiFetch(url,{
   method,
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify(payload)
  });
  if(!response.ok)throw new Error("Erro "+response.status);
  const saved=await response.json();
  editingStudioId=saved.id;
  await loadData();
  updateStudioEditorHeader();
  setStudioFeedback(
   isEditing
    ?"✓ Alterações do projeto “"+saved.titulo+"” salvas em Projetos!"
    :"✓ Projeto “"+saved.titulo+"” salvo em Projetos! Você pode continuar editando ou levá-lo ao Publish.",
   false
  );
  toast(isEditing?"Projeto atualizado em Projetos!":"Projeto salvo na aba Projetos!");
 }catch(error){
  setStudioFeedback(error&&error.name==="TypeError"?"Não foi possível falar com a API. Verifique se ela está em execução.":"Não foi possível salvar o projeto. "+error.message,true);
 }finally{
  if(btn)btn.disabled=false;
 }
}
$("studioTextForm")?.addEventListener("submit",saveStudioTextFile);

function renderStudio(){
 const listEl=$("studioTextList");
 const countEl=$("studioTextCount");
 if(!listEl||!countEl)return;
 const files=studioProjects();
 countEl.textContent=files.length===1?"1 projeto":files.length+" projetos";
 if(files.length===0){
  listEl.innerHTML='<p class="muted empty">Nenhum projeto de texto salvo ainda. Use o editor acima para criar seu primeiro rascunho.</p>';
  return;
 }
 listEl.innerHTML=files.map(item=>{
  const preview=(item.conteudo||"").trim();
  const snippet=preview.length>120?preview.slice(0,120)+"…":preview;
  const active=editingStudioId===item.id;
  const badge=item.naBiblioteca
   ?'<span class="studio-badge published">Na Biblioteca</span>'
   :'<span class="studio-badge draft">Rascunho em Projetos</span>';
  return `<div class="studio-text-item${active?" active":""}">
   <div class="studio-text-info" data-edit-project="${esc(item.id)}" title="Clique para reabrir e editar este projeto">
    <div class="studio-text-head"><b>📄 ${esc(item.titulo)}</b>${badge}</div>
    <p>${esc(snippet||"Sem conteúdo")}</p>
    <small>${esc(bookSubtitle(item))} · ${esc(timeAgo(item.atualizadoEm||item.criadoEm))}</small>
   </div>
   <div class="studio-text-actions">
    <button type="button" class="ghost" data-edit-project="${esc(item.id)}">✎ Editar projeto</button>
    <button type="button" class="primary" data-edit-publish="${esc(item.id)}">↗ Publish</button>
    <button type="button" class="note-delete" data-delete="${esc(item.id)}" title="Excluir projeto">Excluir</button>
   </div>
  </div>`;
 }).join("");
}

// ---------- studio: publish (selecionar importado ou projeto, editar título/descrição/capa e publicar na biblioteca) ----------
function setPublishFeedback(message,isError){
 const el=$("publishFeedback");
 if(!el)return;
 el.textContent=message||"";
 el.className="studio-feedback"+(message?(isError?" error":" success"):"");
}
function setPublishStep(step){
 publishStep=step;
 document.querySelectorAll("#publish .publish-step").forEach(el=>{
  el.classList.toggle("active",Number(el.dataset.step)===step);
 });
}
function clearPublishCover(){
 publishCoverData="";
 if($("publishCoverInput"))$("publishCoverInput").value="";
 if($("publishClearCoverBtn"))$("publishClearCoverBtn").hidden=true;
 updatePublishPreview($("publishTitle")?.value||"",$("publishDescription")?.value||"",itemById(selectedPublishId));
}
function updatePublishPreview(titulo,descricao,item){
 const cleanTitle=(titulo||"").trim()||"SELECIONE UM ARQUIVO";
 const words=cleanTitle.toUpperCase().split(/\s+/).slice(0,3).map(esc).join("<br>");
 const desc=(descricao||"").trim();
 const sub=desc?esc(desc.slice(0,42)+(desc.length>42?"…":"")):(item?esc(bookSubtitle(item)):"Um guia prático");
 const cover=$("publishCover");
 if(cover){
  if(publishCoverData){
   cover.style.background="#181b23";
   cover.innerHTML=`<img class="publish-cover-img" src="${esc(publishCoverData)}" alt="Capa de ${esc(cleanTitle)}">`;
  }else{
   cover.style.background=titulo?coverColor(cleanTitle):"#3d315c";
   cover.innerHTML=`${words}<br><small>${sub}</small>`;
  }
 }
 if($("publishClearCoverBtn"))$("publishClearCoverBtn").hidden=!publishCoverData;
 const heading=$("publishHeading");
 if(heading)heading.textContent=titulo?cleanTitle:"Selecione um arquivo ou projeto";
 const included=$("publishIncluded");
 if(included){
  if(item){
   const originLabel=isTextItem(item)?"Projeto de texto (Studio)":"Arquivo importado (PDF)";
   const statusLabel=item.naBiblioteca?"Já disponível na Biblioteca":"Rascunho · Será enviado para a Biblioteca ao publicar";
   const coverLabel=publishCoverData?"Capa personalizada aplicada":"Capa padrão gerada";
   included.innerHTML=`✓ <b>${esc(cleanTitle)}</b> · ${esc(originLabel)} · ${esc(item.tamanho||"1 KB")}<br><small>${esc(coverLabel)} · ${esc(statusLabel)}</small>`;
  }else{
   included.textContent="Nenhum arquivo ou projeto selecionado.";
  }
 }
 const meta=$("publishPreviewMeta");
 if(meta){
  meta.textContent=item
   ?(item.naBiblioteca?"Publicado na Biblioteca":"Rascunho do Studio — pronto para publicar na Biblioteca")
   :"Selecione um item para visualizar a capa e publicar na Biblioteca.";
 }
}
function renderPublish(){
 const select=$("publishFileSelect");
 const listEl=$("publishFileList");
 if(!select||!listEl)return;
 const files=publishableItems();
 select.innerHTML='<option value="">Selecione um arquivo ou projeto...</option>'+
  files.map(f=>{
   const tag=isTextItem(f)?(f.naBiblioteca?"Projeto · Na Biblioteca":"Projeto · Rascunho"):"Importado · PDF";
   return `<option value="${esc(f.id)}">${esc(f.titulo)} (${tag})</option>`;
  }).join("");
 if(selectedPublishId&&files.some(f=>f.id===selectedPublishId)){
  select.value=selectedPublishId;
 }else{
  selectedPublishId="";
  select.value="";
 }
 if(files.length===0){
  listEl.innerHTML='<p class="muted empty-inline">Nenhum arquivo importado ou projeto encontrado. <button type="button" class="link" onclick="openPage(\'studio\')">Criar projeto em Projetos →</button> ou <button type="button" class="link" onclick="openImport()">Importar PDF →</button></p>';
 }else{
  listEl.innerHTML=files.map(f=>{
   const icon=isTextItem(f)?"📄":"📕";
   const kind=isTextItem(f)?(f.naBiblioteca?"Biblioteca":"Projeto"):"PDF";
   return `<button type="button" class="publish-file-chip${selectedPublishId===f.id?" active":""}" data-publish-id="${esc(f.id)}">${icon} <span>${esc(f.titulo)}</span> <small>${esc(kind)}</small></button>`;
  }).join("");
 }
 if(!selectedPublishId){
  const activeEl=document.activeElement;
  if(activeEl!==$("publishTitle")&&activeEl!==$("publishDescription")){
   if($("publishTitle"))$("publishTitle").value="";
   if($("publishDescription"))$("publishDescription").value="";
   publishCoverData="";
   updatePublishPreview("","",null);
  }
 }
}
function selectPublishFile(id){
 selectedPublishId=id||"";
 const select=$("publishFileSelect");
 if(select&&select.value!==selectedPublishId)select.value=selectedPublishId;
 document.querySelectorAll("#publishFileList .publish-file-chip").forEach(btn=>{
  btn.classList.toggle("active",btn.dataset.publishId===selectedPublishId);
 });
 setPublishFeedback("");
 const titleInput=$("publishTitle");
 const descInput=$("publishDescription");
 const coverInput=$("publishCoverInput");
 if(coverInput)coverInput.value="";
 if(!selectedPublishId){
  if(titleInput)titleInput.value="";
  if(descInput)descInput.value="";
  publishCoverData="";
  if($("publishStatusKicker"))$("publishStatusKicker").textContent="CONFIGURAÇÃO DE PUBLICAÇÃO";
  updatePublishPreview("","",null);
  return;
 }
 const item=itemById(selectedPublishId);
 if(!item)return;
 if(titleInput)titleInput.value=item.titulo||"";
 if(descInput)descInput.value=item.descricao||"";
 publishCoverData=item.capa||"";
 if($("publishStatusKicker")){
  $("publishStatusKicker").textContent=isTextItem(item)
   ?"PROJETO DO STUDIO SELECIONADO"
   :"ARQUIVO IMPORTADO SELECIONADO";
 }
 setPublishStep(2);
 updatePublishPreview(item.titulo,item.descricao||"",item);
}
function openInPublish(id){
 openPage("publish");
 selectPublishFile(id);
}
$("publishFileSelect")?.addEventListener("change",e=>selectPublishFile(e.target.value));
$("publishTitle")?.addEventListener("input",()=>{
 updatePublishPreview($("publishTitle").value,$("publishDescription").value,itemById(selectedPublishId));
});
$("publishDescription")?.addEventListener("input",()=>{
 updatePublishPreview($("publishTitle").value,$("publishDescription").value,itemById(selectedPublishId));
});
$("publishCoverInput")?.addEventListener("change",e=>{
 const file=e.target.files?.[0];
 if(!file)return;
 if(!file.type.startsWith("image/")){
  setPublishFeedback("Selecione um arquivo de imagem válido (PNG, JPG, WEBP, GIF).",true);
  e.target.value="";
  return;
 }
 const reader=new FileReader();
 reader.onload=()=>{
  publishCoverData=String(reader.result||"");
  setPublishFeedback("Imagem de capa carregada. Clique em “Publicar / Salvar Alterações” para aplicar.",false);
  updatePublishPreview($("publishTitle")?.value||"",$("publishDescription")?.value||"",itemById(selectedPublishId));
 };
 reader.onerror=()=>{
  setPublishFeedback("Não foi possível ler a imagem selecionada.",true);
 };
 reader.readAsDataURL(file);
});

async function savePublishFile(event){
 if(event)event.preventDefault();
 if(!selectedPublishId){
  setPublishFeedback("Selecione um arquivo importado ou um projeto de texto primeiro.",true);
  toast("Selecione um arquivo ou projeto para publicar.");
  $("publishFileSelect")?.focus();
  return;
 }
 const titleInput=$("publishTitle");
 const descInput=$("publishDescription");
 const titulo=(titleInput?.value||"").trim();
 const descricao=(descInput?.value||"").trim();
 if(!titulo){
  setPublishFeedback("Informe o título do arquivo para publicação.",true);
  titleInput?.focus();
  return;
 }
 const btn=$("publishSaveBtn");
 if(btn)btn.disabled=true;
 setPublishFeedback("");
 try{
  const response=await apiFetch("/api/items/"+encodeURIComponent(selectedPublishId),{
   method:"PUT",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({
    titulo,
    descricao,
    capa:publishCoverData||"",
    naBiblioteca:true,
    publicadoEm:new Date().toISOString()
   })
  });
  if(!response.ok)throw new Error("Erro "+response.status);
  const updated=await response.json();
  await loadData();
  selectedPublishId=updated.id;
  publishCoverData=updated.capa||"";
  if($("publishFileSelect"))$("publishFileSelect").value=updated.id;
  if(titleInput)titleInput.value=updated.titulo;
  if(descInput)descInput.value=updated.descricao||"";
  document.querySelectorAll("#publishFileList .publish-file-chip").forEach(chip=>{
   chip.classList.toggle("active",chip.dataset.publishId===updated.id);
  });
  setPublishStep(3);
  if($("publishStatusKicker"))$("publishStatusKicker").textContent="PUBLICADO NA BIBLIOTECA";
  updatePublishPreview(updated.titulo,updated.descricao||"",updated);
  if(currentBook&&currentBook.id===updated.id){
   currentBook.title=updated.titulo;
   $("readerTitle").textContent=updated.titulo;
  }
  setPublishFeedback("✓ “"+updated.titulo+"” foi atualizado e está disponível na sua Biblioteca!",false);
  toast("Publicado na Biblioteca com sucesso!");
 }catch(error){
  setPublishFeedback(error&&error.name==="TypeError"?"Não foi possível falar com a API. Verifique se ela está em execução.":"Não foi possível publicar as alterações. "+error.message,true);
 }finally{
  if(btn)btn.disabled=false;
 }
}
$("publishEditForm")?.addEventListener("submit",savePublishFile);

// ---------- busca universal ----------
function runSearch(){
 const q=norm($("globalSearch").value||$("searchInput").value).trim();
 const el=$("searchResults");
 if(!q){
  el.innerHTML='<p class="muted empty">Digite para buscar nos nomes dos arquivos e no texto das notas.</p>';
  return;
 }
 const files=importedBooks.filter(b=>norm(b.titulo).includes(q)||norm(b.nomeOriginal).includes(q)||norm(b.conteudo).includes(q));
 const notes=apiNotes.filter(n=>norm(n.conteudo).includes(q)||norm(itemTitle(n.itemId)).includes(q)||norm(n.posicao).includes(q));
 if(files.length===0&&notes.length===0){
  el.innerHTML='<p class="muted empty">Nenhum resultado para “'+esc($("globalSearch").value||$("searchInput").value)+'”.</p>';
  return;
 }
 let html="";
 if(files.length){
  html+=`<div class="search-group">ARQUIVOS (${files.length})</div>`+files.map(b=>`<div class="search-result" data-title="${esc(b.titulo)}" data-id="${esc(b.id)}"><b>${esc(b.titulo)}</b><p>${esc(bookSubtitle(b))}</p></div>`).join("");
 }
 if(notes.length){
  html+=`<div class="search-group">NOTAS (${notes.length})</div>`+notes.map(n=>{
   const page=/^\d+$/.test(n.posicao||"")?` data-page="${esc(n.posicao)}"`:"";
   return `<div class="search-result" data-title="${esc(itemTitle(n.itemId))}" data-id="${esc(n.itemId)}"${page}><b>${esc(pageLabel(n.posicao)||"Nota")} · ${esc(itemTitle(n.itemId))}</b><p>${esc(n.conteudo)}</p></div>`;
  }).join("");
 }
 el.innerHTML=html;
}
function syncSearch(source,other){
 other.value=source.value;
 runSearch();
}
$("globalSearch").addEventListener("focus",()=>{if(!$("search").classList.contains("active"))openPage("search")});
$("globalSearch").addEventListener("input",()=>syncSearch($("globalSearch"),$("searchInput")));
$("searchInput").addEventListener("input",()=>syncSearch($("searchInput"),$("globalSearch")));

// ---------- importação de PDFs ----------
function setImportStatus(message,isError){
 const el=$("importStatus");
 el.textContent=message;
 el.style.color=isError?"#fca5a5":"";
}
function openImport(){setImportStatus("");$("modal").classList.remove("hidden")}
function closeModal(){$("modal").classList.add("hidden");$("fileInput").value=""}
async function importFiles(fileList){
 const files=Array.from(fileList);
 if(files.length===0)return;
 const form=new FormData();
 files.forEach(file=>form.append("arquivos",file));
 setImportStatus(files.length===1?"Importando 1 arquivo...":"Importando "+files.length+" arquivos...");
 let data;
 try{
  const response=await apiFetch("/api/items/import",{method:"POST",body:form});
  data=await response.json().catch(()=>({}));
  // 422: nenhum arquivo aproveitado, mas o corpo traz os motivos
  if(!response.ok&&response.status!==422)throw new Error(data.error||"Erro "+response.status);
 }catch(error){
  setImportStatus(error&&error.name==="TypeError"?"Não foi possível falar com a API. Verifique se ela está em execução.":error.message,true);
  return;
 }
 const imported=data.importados||[];
 const rejected=data.rejeitados||[];
 await loadData();
 if(imported.length>0)openPage("library");
 if(rejected.length>0){
  const prefix=imported.length>0?imported.length+" importado(s). ":"";
  setImportStatus(prefix+"Não importado: "+rejected.map(r=>r.nome+" ("+r.motivo+")").join("; "),true);
  return;
 }
 closeModal();
 toast(imported.length===1?"PDF importado para a biblioteca.":imported.length+" PDFs importados para a biblioteca.");
}
const fileInput=$("fileInput");
const dropZone=$("dropZone");
fileInput.addEventListener("change",()=>{importFiles(fileInput.files);fileInput.value=""});
dropZone.addEventListener("dragover",e=>{e.preventDefault();dropZone.classList.add("over")});
dropZone.addEventListener("dragleave",()=>dropZone.classList.remove("over"));
dropZone.addEventListener("drop",e=>{e.preventDefault();dropZone.classList.remove("over");importFiles(e.dataTransfer.files)});

// ---------- sessão do usuário, meu espaço, logout e painel admin ----------
function renderUserProfile(){
 const u=currentUser||{nome:"Usuário Staander",email:"",role:"user",plano:"Plano gratuito"};
 const initials=userInitials(u.nome);
 const isAdmin=u.role==="admin";
 if($("topUserName"))$("topUserName").textContent=u.nome;
 if($("topUserAvatar"))$("topUserAvatar").textContent=initials;
 if($("topAdminBadge"))$("topAdminBadge").hidden=!isAdmin;
 if($("sidebarAvatar"))$("sidebarAvatar").textContent=initials;
 if($("sidebarUserName"))$("sidebarUserName").textContent=u.nome||"Meu espaço";
 if($("sidebarUserPlan"))$("sidebarUserPlan").textContent=isAdmin?"Administrador · Meu espaço":(u.email||u.plano||"Meu espaço");
 if($("navAdmin"))$("navAdmin").hidden=!isAdmin;

 // Seção "Meu Espaço" (#settings)
 if($("profileAvatar"))$("profileAvatar").textContent=initials;
 if($("profileName"))$("profileName").textContent=u.nome;
 if($("profileEmail"))$("profileEmail").textContent=u.email||"Sessão autenticada";
 if($("profileRoleBadge")){
  $("profileRoleBadge").textContent=isAdmin?"Administrador":"Usuário";
  $("profileRoleBadge").className="studio-badge "+(isAdmin?"published":"draft");
 }
 if($("profileSince")){
  $("profileSince").textContent=u.criadoEm?"Membro desde "+formatDate(u.criadoEm):"Sessão ativa";
 }
 if($("profileBookCount"))$("profileBookCount").textContent=String(importedBooks.length);
 if($("profileProjectCount"))$("profileProjectCount").textContent=String(studioProjects().length);
 if($("profileNoteCount"))$("profileNoteCount").textContent=String(apiNotes.length);
 if($("profilePlanLabel"))$("profilePlanLabel").textContent=isAdmin?"Admin":"Gratuito";
}

async function loadUserSession(){
 try{
  const raw=localStorage.getItem(USER_KEY);
  if(raw)currentUser=JSON.parse(raw);
 }catch(e){}
 renderUserProfile();
 const token=localStorage.getItem(TOKEN_KEY);
 if(!token)return;
 try{
  const res=await apiFetch("/api/me");
  if(!res.ok)throw new Error("Sessão expirada");
  const user=await res.json();
  currentUser=user;
  localStorage.setItem(USER_KEY,JSON.stringify(user));
  renderUserProfile();
 }catch(error){
  logoutUser();
 }
}

function logoutUser(){
 localStorage.removeItem(TOKEN_KEY);
 localStorage.removeItem(USER_KEY);
 currentUser=null;
 if(window.parent&&window.parent!==window){
  window.parent.postMessage({type:"STAANDER_LOGOUT"},"*");
 }else{
  window.location.href="/";
 }
}

async function loadAdminOverview(){
 if(!currentUser||currentUser.role!=="admin")return;
 try{
  const res=await apiFetch("/api/admin/overview");
  if(!res.ok)throw new Error("Erro "+res.status);
  adminData=await res.json();
  renderAdmin();
 }catch(error){
  toast("Não foi possível carregar os dados do painel de administrador.");
 }
}

function selectAdminUser(userId){
 selectedAdminUserId=selectedAdminUserId===userId?"":(userId||"");
 renderAdmin();
}

function renderAdmin(){
 if(!adminData)return;
 const {resumo={},usuarios=[],atividadesGlobais=[]}=adminData;
 if($("adminUserCount"))$("adminUserCount").textContent=String(resumo.totalUsuarios||usuarios.length||0);
 if($("adminProjectCount"))$("adminProjectCount").textContent=String(resumo.totalProjetos||0);
 if($("adminImportCount"))$("adminImportCount").textContent=String(resumo.totalImportados||0);
 if($("adminPublishCount"))$("adminPublishCount").textContent=String(resumo.totalPublicacoes||0);

 const usersEl=$("adminUsersList");
 if(usersEl){
  if(usuarios.length===0){
   usersEl.innerHTML='<p class="muted empty">Nenhum usuário cadastrado.</p>';
  }else{
   usersEl.innerHTML=usuarios.map(u=>{
    const active=selectedAdminUserId===u.id;
    const isAdmin=u.role==="admin";
    const projCount=(u.projetosCriados||[]).length;
    const impCount=(u.arquivosImportados||[]).length;
    const pubCount=(u.publicacoesBiblioteca||[]).length;
    const noteCount=(u.notas||[]).length;
    return `<div class="admin-user-row${active?" active":""}" data-admin-user="${esc(u.id)}">
     <div class="avatar">${esc(userInitials(u.nome))}</div>
     <div class="admin-user-info">
      <div class="studio-text-head">
       <b>${esc(u.nome)}</b>
       <span class="studio-badge ${isAdmin?"published":"draft"}">${isAdmin?"ADMIN":"USUÁRIO"}</span>
      </div>
      <p>${esc(u.email)}</p>
      <small>${projCount} projetos · ${impCount} PDFs importados · ${pubCount} na biblioteca · ${noteCount} notas</small>
     </div>
     <span class="admin-user-meta">${esc(u.ultimoAcessoEm?"Acesso "+timeAgo(u.ultimoAcessoEm):"Novo")}</span>
    </div>`;
   }).join("");
  }
 }

 const actEl=$("adminGlobalActivities");
 const selectedUser=selectedAdminUserId?usuarios.find(u=>u.id===selectedAdminUserId):null;
 if($("adminActivityFilterLabel")){
  $("adminActivityFilterLabel").textContent=selectedUser?"Filtrado: "+selectedUser.nome:"Todos os usuários";
 }
 if(actEl){
  const list=selectedUser?(selectedUser.atividadesRecentes||[]):atividadesGlobais;
  if(list.length===0){
   actEl.innerHTML='<p class="muted empty">Nenhuma atividade registrada ainda.</p>';
  }else{
   actEl.innerHTML=list.slice(0,12).map(a=>`<div class="activity">
    <span class="dot ${a.tipo==="publicacao"?"green":a.tipo==="importacao"?"orange":"purple"}"></span>
    <div>
     <b>${esc(a.userName||"Usuário")} <small class="muted">(${esc(a.userEmail||"")})</small></b>
     <p>${esc(a.descricao)}</p>
     <small>${esc(timeAgo(a.criadoEm))}</small>
    </div>
   </div>`).join("");
  }
 }

 const detailEl=$("adminUserDetail");
 if($("adminDetailTitle")){
  $("adminDetailTitle").textContent=selectedUser
   ?"O que "+selectedUser.nome+" está fazendo"
   :"Acompanhamento de todos os usuários ("+usuarios.length+")";
 }
 if(detailEl){
  const targetUsers=selectedUser?[selectedUser]:usuarios;
  detailEl.innerHTML=targetUsers.map(u=>{
   const projs=u.projetosCriados||[];
   const imps=u.arquivosImportados||[];
   const pubs=u.publicacoesBiblioteca||[];
   const notas=u.notas||[];
   return `<div class="admin-user-card">
    <div class="admin-user-card-head">
     <div class="avatar">${esc(userInitials(u.nome))}</div>
     <div>
      <div class="studio-text-head">
       <h3>${esc(u.nome)}</h3>
       <span class="studio-badge ${u.role==="admin"?"published":"draft"}">${u.role==="admin"?"Administrador":"Usuário"}</span>
      </div>
      <small class="muted">${esc(u.email)} · Cadastro em ${esc(formatDate(u.criadoEm)||"hoje")}</small>
     </div>
    </div>
    <div class="admin-columns">
     <div class="admin-col">
      <h4>▦ Projetos no Studio (${projs.length})</h4>
      ${projs.length===0
       ?'<p class="muted empty-inline">Nenhum projeto criado.</p>'
       :projs.map(p=>`<div class="admin-item-pill"><b>📄 ${esc(p.titulo)}</b><span>${p.naBiblioteca?"Publicado na Biblioteca":"Rascunho em Projetos"} · ${esc(p.tamanho||"1 KB")}</span></div>`).join("")}
     </div>
     <div class="admin-col">
      <h4>📥 Arquivos Importados (${imps.length})</h4>
      ${imps.length===0
       ?'<p class="muted empty-inline">Nenhum PDF importado.</p>'
       :imps.map(f=>{
        const total=Number(f.totalPaginas)||0;
        const lidas=Math.min(Number(f.maxPagina)||0,total);
        const progresso=total?`${lidas} / ${total} páginas · ${Math.round(lidas/total*100)}%`:"Progresso ainda não disponível";
        return `<div class="admin-item-pill"><b>📕 ${esc(f.titulo)}</b><span>${esc(f.tamanho||"PDF")} · ${f.status==="lido"?"Concluído":f.status==="em_leitura"?"Em leitura":"Não lido"} · ${esc(progresso)}</span></div>`;
       }).join("")}
     </div>
     <div class="admin-col">
      <h4>▤ Publicações na Biblioteca (${pubs.length})</h4>
      ${pubs.length===0
       ?'<p class="muted empty-inline">Nenhum item na biblioteca.</p>'
       :pubs.map(b=>`<div class="admin-item-pill"><b>✓ ${esc(b.titulo)}</b><span>${esc(b.tipo||"PDF")}${b.descricao?" · "+esc(b.descricao.slice(0,40)):""}${b.capa?" · Com capa":""}</span></div>`).join("")}
     </div>
     <div class="admin-col">
      <h4>✎ Notas Criadas (${notas.length})</h4>
      ${notas.length===0
       ?'<p class="muted empty-inline">Nenhuma nota criada.</p>'
       :notas.slice(0,6).map(n=>`<div class="admin-item-pill"><b>${esc(pageLabel(n.posicao)||"Nota")}</b><span>“${esc(n.conteudo.slice(0,50))}”</span></div>`).join("")}
     </div>
    </div>
   </div>`;
  }).join("");
 }
}

// ---------- atalhos ----------
document.addEventListener("keydown",e=>{
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){
  e.preventDefault();
  openPage("search");
  setTimeout(()=>$("globalSearch").focus(),50);
 }
 if(e.key==="Escape"){closeConfirm(false);closeModal();closeNoteModal()}
});

loadUserSession();renderHome();renderLibrary();renderNotes();renderReaderNotes();renderStudio();renderPublish();loadData();
