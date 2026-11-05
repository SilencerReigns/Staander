const books=[
["The Art of Strategy","Avinash Dixit & Barry Nalebuff","Estratégia"],
["Designing Data-Intensive Applications","Martin Kleppmann","Tecnologia"],
["Atomic Habits","James Clear","Hábitos"],
["Good Strategy Bad Strategy","Richard Rumelt","Negócios"],
["The Lean Startup","Eric Ries","Produto"],
["Zero to One","Peter Thiel","Negócios"],
["Influence","Robert Cialdini","Marketing"],
["Thinking, Fast and Slow","Daniel Kahneman","Psicologia"],
["Competitive Strategy","Michael Porter","Estratégia"],
["Hooked","Nir Eyal","Produto"]
];
const notes=[
["Ideia para o projeto Staander","Relacionar a leitura sobre sistemas ao módulo de inteligência competitiva.","The Art of Strategy","há 2 h"],
["Diferenciação","A vantagem aparece quando o produto reduz complexidade para o usuário.","Good Strategy Bad Strategy","ontem"],
["Pesquisa","Mapear as fontes antes de construir a hipótese.","Competitive Strategy","há 2 dias"],
["Produto","O Studio pode organizar arquivos, versões, bônus e referências por produto.","Staander","há 3 dias"],
["Leitura","Voltar às fontes originais quando uma nova pergunta surgir.","Atomic Habits","há 4 dias"]
];
let readerNotesRequest=0;

function openPage(id){
 document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
 document.getElementById(id).classList.add("active");
 document.querySelectorAll(".nav").forEach(n=>n.classList.toggle("active",n.dataset.page===id));
 window.scrollTo({top:0,behavior:"smooth"});
 if(id==="library")renderLibrary(); if(id==="notes")renderNotes(); if(id==="search")runSearch();
}
document.querySelectorAll(".nav").forEach(n=>n.onclick=()=>openPage(n.dataset.page));
function renderBooks(target="recentGrid",limit=6){
 const el=document.getElementById(target); if(!el)return;
 el.innerHTML=books.slice(0,limit).map((b,i)=>`<div class="book" onclick="openReader('${b[0].replace(/'/g,"\\'")}')"><div class="book-cover" style="background:hsl(${255+i*24} 20% ${23+i*2}% )">${b[0].toUpperCase()}</div><div class="book-title">${b[0]}</div><div class="book-author">${b[1]}</div></div>`).join("");
}
function renderLibrary(){
 const q=(document.getElementById("libraryFilter")?.value||"").toLowerCase();
 const list=books.filter(b=>b.join(" ").toLowerCase().includes(q));
 document.getElementById("libraryGrid").innerHTML=list.map((b,i)=>`<div class="book" onclick="openReader('${b[0].replace(/'/g,"\\'")}')"><div class="book-cover" style="background:hsl(${255+i*24} 20% ${23+i*2}% )">${b[0].toUpperCase()}</div><div class="book-title">${b[0]}</div><div class="book-author">${b[1]} · ${b[2]}</div></div>`).join("");
}
function renderNotes(){
 document.getElementById("notesList").innerHTML=notes.map(n=>`<div class="note-row"><b>${n[0]}</b><p>${n[1]}</p><small>${n[2]} · ${n[3]}</small></div>`).join("");
}
function runSearch(){
 const q=(document.getElementById("searchInput")?.value||"").trim().toLowerCase();
 const results=q?books.filter(b=>b.join(" ").toLowerCase().includes(q)).slice(0,6):books.slice(0,4);
 document.getElementById("searchResults").innerHTML=results.map(b=>`<div class="search-result"><b>${b[0]}</b><p>${b[1]} · ${b[2]} · Resultado em título e metadados</p></div>`).join("");
}
function openReader(title){
 document.getElementById("readerTitle").textContent=title;
 openPage("reader");
 renderReaderNotes(title);
}
async function renderReaderNotes(title){
 const container=document.getElementById("readerNotesList");
 const requestId=++readerNotesRequest;
 container.replaceChildren();
 showReaderNotesMessage(container,"Carregando notas...");
 try{
  const responses=await Promise.all([fetch("/api/items"),fetch("/api/notes")]);
  if(responses.some(response=>!response.ok))throw new Error("A API retornou um erro.");
  const [items,allNotes]=await Promise.all(responses.map(response=>response.json()));
  if(requestId!==readerNotesRequest)return;
  const item=items.find(book=>book.titulo.trim().toLocaleLowerCase()===title.trim().toLocaleLowerCase());
  if(!item){
   showReaderNotesMessage(container,"Este e-book ainda não está cadastrado na biblioteca da aplicação. Cadastre-o e vincule notas para vê-las aqui.");
   return;
  }
  const relatedNotes=allNotes.filter(note=>note.itemId===item.id);
  if(relatedNotes.length===0){
   showReaderNotesMessage(container,"Nenhuma nota vinculada a este e-book.");
   return;
  }
  container.replaceChildren(...relatedNotes.map(createReaderNote));
 }catch(error){
  if(requestId!==readerNotesRequest)return;
  console.error("Não foi possível carregar as notas do e-book:",error);
  showReaderNotesMessage(container,"Não foi possível carregar as notas. Verifique se a API está em execução.");
 }
}
function showReaderNotesMessage(container,message){
 const paragraph=document.createElement("p");
 paragraph.className="muted";
 paragraph.textContent=message;
 container.replaceChildren(paragraph);
}
function createReaderNote(note){
 const card=document.createElement("div");
 card.className="mini-note";
 const heading=document.createElement("b");
 heading.textContent=note.posicao||"Nota";
 const content=document.createElement("p");
 content.textContent=note.conteudo;
 const date=document.createElement("small");
 date.textContent=new Date(note.criadoEm).toLocaleDateString("pt-BR");
 card.append(heading,content,date);
 return card;
}
function togglePanel(id){document.getElementById(id).style.display=document.getElementById(id).style.display==="none"?"block":"none"}
function openImport(){document.getElementById("modal").classList.remove("hidden")}
function closeModal(){document.getElementById("modal").classList.add("hidden")}
function simulateImport(){closeModal();books.push(["Novo arquivo importado","Arquivo adicionado agora","Importado"]);renderBooks();toast("Arquivo importado para a biblioteca.");document.getElementById("bookCount").textContent=books.length+14}
function addNote(){notes.unshift(["Nova nota","Nota criada no protótipo. Edite o conteúdo quando o editor real estiver conectado.","Staander","agora"]);document.getElementById("noteCount").textContent=notes.length+32;renderNotes();openPage("notes");toast("Nova nota criada.")}
function newProject(){toast("Novo projeto criado em modo demonstração.")}
function openProject(name){toast("Abrindo projeto: "+name)}
function toast(t){const x=document.getElementById("toast");x.textContent=t;x.classList.add("show");setTimeout(()=>x.classList.remove("show"),2200)}
function toggleSidebar(){document.querySelector(".sidebar").classList.toggle("open")}
document.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();openPage("search");setTimeout(()=>document.getElementById("searchInput").focus(),50)}})
renderBooks();renderLibrary();renderNotes();
