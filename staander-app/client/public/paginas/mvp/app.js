// Staander MVP: biblioteca de PDFs, leitor, notas e busca. Todos os dados vêm da API.
const $=id=>document.getElementById(id);
let importedBooks=[],apiItems=[],apiNotes=[],currentBook=null;

// ---------- utilidades ----------
function esc(value){
 return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function norm(value){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()}
function itemById(id){return apiItems.find(i=>i.id===id)}
function itemTitle(id){const item=itemById(id);return item?item.titulo:"Arquivo removido"}
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
function authHeaders(){
 const token=localStorage.getItem("staander_token");
 return token?{Authorization:"Bearer "+token}:{};
}
function apiFetch(path,options={}){
 return fetch(path,{...options,headers:{...options.headers,...authHeaders()}});
}
function logout(){
 localStorage.removeItem("staander_token");
 window.parent.location.reload();
}
async function loadProfile(){
 try{
  const response=await apiFetch("/api/me");
  if(response.status===401){logout();return}
  if(!response.ok)throw new Error("Erro "+response.status);
  const user=await response.json();
  $("profileName").textContent=user.nome;
  const initials=user.nome.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase()||"--";
  $("profileAvatar").textContent=initials;
  $("topAvatar").textContent=initials;
  const isAdmin=user.role==="admin";
  $("adminDivider").hidden=!isAdmin;
  $("adminLabel").hidden=!isAdmin;
  $("adminNav").hidden=!isAdmin;
 }catch(error){
  toast("Não foi possível carregar seu perfil. "+error.message);
 }
}
$("logoutButton").addEventListener("click",logout);

// ---------- navegação ----------
function openPage(id){
 if(id!=="reader")saveProgress();
 document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
 $(id).classList.add("active");
 document.querySelectorAll(".nav").forEach(n=>n.classList.toggle("active",n.dataset.page===id));
 window.scrollTo({top:0,behavior:"smooth"});
 if(id==="home")renderHome();
 if(id==="library")renderLibrary();
 if(id==="notes")renderNotes();
 if(id==="search")runSearch();
 if(id==="admin")loadAdminProgress();
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
function newProject(){toast("Novo projeto criado em modo demonstração.")}
function openProject(name){toast("Abrindo projeto: "+name)}

// cliques delegados: abrir arquivo, excluir arquivo/nota, pular para a página de uma nota
document.addEventListener("click",e=>{
 const delFile=e.target.closest("[data-delete]");
 if(delFile){deleteItem(delFile.dataset.delete);return}
 const delNote=e.target.closest("[data-delete-note]");
 if(delNote){deleteNote(delNote.dataset.deleteNote);return}
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
  importedBooks=items.filter(item=>item.arquivo).reverse(); // mais recentes primeiro
 }catch(error){
  apiItems=[];apiNotes=[];importedBooks=[];
 }
 renderHome(); renderLibrary(); renderNotes();
 if($("search").classList.contains("active"))runSearch();
 if(currentBook)renderReaderNotes();
}

async function loadAdminProgress(){
 const status=$("adminProgressStatus");
 const list=$("adminProgressList");
 status.textContent="Carregando progresso...";
 list.replaceChildren();
 try{
  const response=await apiFetch("/api/admin/progress");
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||"Erro "+response.status);
  if(data.usuarios.length===0){
   status.textContent="Ainda não há usuários cadastrados.";
   return;
  }
  status.textContent="";
  list.innerHTML=data.usuarios.map(user=>{
   const items=user.itens.length
    ? user.itens.map(item=>{
      const percent=Number.isFinite(item.percentual)?Math.max(0,Math.min(100,item.percentual)):null;
      const statusLabel={nao_lido:"Não iniciado",em_leitura:"Em leitura",lido:"Concluído"}[item.status]||"Sem status";
      const progress=percent===null
       ? "Progresso ainda não disponível"
       : `${item.paginasLidas} / ${item.totalPaginas} páginas · ${percent}%`;
      return `<article class="admin-progress-item"><div class="admin-progress-heading"><b>${esc(item.titulo)}</b><span>${statusLabel}</span></div><p>${progress}</p><div class="admin-progress-bar"><i style="width:${percent||0}%"></i></div></article>`;
     }).join("")
    : '<p class="muted">Nenhum arquivo na biblioteca.</p>';
   return `<section class="panel admin-user"><div class="admin-user-heading"><div><h2>${esc(user.nome)}</h2><p>${esc(user.email)}</p></div><span>${user.itens.length} arquivo(s)</span></div>${items}</section>`;
  }).join("");
 }catch(error){
  status.textContent="Não foi possível carregar o progresso. "+error.message;
 }
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
  $("continueList").innerHTML='<p class="muted empty">Você ainda não abriu nenhum arquivo. Importe um PDF e comece a ler.</p>';
  return;
 }
 $("continueList").innerHTML=opened.map(item=>{
  const p=progressOf(item);
  const cover=item.titulo.toUpperCase().split(/\s+/).slice(0,3).map(esc).join("<br>");
  return `<div class="reading-card" data-title="${esc(item.titulo)}" data-id="${esc(item.id)}"><div class="cover" style="background:${coverColor(item.titulo)}">${cover}</div><div class="reading-info"><h3>${esc(item.titulo)}</h3><p class="muted">${item.paginaAtual?"Parou na página "+item.paginaAtual:"Ainda não avançou"}</p><div class="bar"><i style="width:${p.percent}%"></i></div><small>${p.percent}% · ${p.max} / ${p.total||"?"} páginas</small></div><b class="play">▶</b></div>`;
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
function bookSubtitle(item){return "PDF · "+item.tamanho+(item.totalPaginas?" · "+item.totalPaginas+" págs.":"")}
function bookCard(item){
 return `<div class="book" data-title="${esc(item.titulo)}" data-id="${esc(item.id)}"><button type="button" class="book-delete" data-delete="${esc(item.id)}" title="Excluir arquivo" aria-label="Excluir ${esc(item.titulo)}">🗑</button><div class="book-cover" style="background:${coverColor(item.titulo)}">${esc(item.titulo.toUpperCase())}</div><div class="book-title">${esc(item.titulo)}</div><div class="book-author">${esc(bookSubtitle(item))}</div></div>`;
}
function renderBooks(target="recentGrid",limit=6){
 const el=$(target); if(!el)return;
 if(importedBooks.length===0){
  el.innerHTML='<p class="muted empty">Nenhum arquivo ainda. Use “Importar arquivo” para trazer seus PDFs.</p>';
  return;
 }
 el.innerHTML=importedBooks.slice(0,limit).map(bookCard).join("");
}
function renderLibrary(){
 const q=norm($("libraryFilter")?.value||"");
 const list=importedBooks.filter(b=>norm(b.titulo).includes(q));
 if(list.length===0){
  $("libraryGrid").innerHTML=importedBooks.length===0
   ?'<p class="muted empty">Sua biblioteca está vazia. Clique em “Importar” para adicionar seus PDFs.</p>'
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
 if(reading.id===id&&reading.ready){
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
 if(!reading.ready||!reading.total||!$("reader").classList.contains("active"))return;
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

// ---------- busca universal ----------
function runSearch(){
 const q=norm($("globalSearch").value||$("searchInput").value).trim();
 const el=$("searchResults");
 if(!q){
  el.innerHTML='<p class="muted empty">Digite para buscar nos nomes dos arquivos e no texto das notas.</p>';
  return;
 }
 const files=importedBooks.filter(b=>norm(b.titulo).includes(q)||norm(b.nomeOriginal).includes(q));
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

// ---------- atalhos ----------
document.addEventListener("keydown",e=>{
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){
  e.preventDefault();
  openPage("search");
  setTimeout(()=>$("globalSearch").focus(),50);
 }
 if(e.key==="Escape"){closeConfirm(false);closeModal();closeNoteModal()}
});

renderHome();renderLibrary();renderNotes();renderReaderNotes();loadProfile();loadData();
