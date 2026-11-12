import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const form=document.querySelector("#project-form"), submitButton=document.querySelector("#submit-button");
const formStatus=document.querySelector("#form-status"), loadStatus=document.querySelector("#load-status");
const entriesContainer=document.querySelector("#project-entries"), entryCount=document.querySelector("#entry-count");
const ready=firebaseConfig.apiKey!=="YOUR_API_KEY"&&firebaseConfig.projectId!=="YOUR_PROJECT_ID"&&firebaseConfig.appId!=="YOUR_APP_ID";

if(!ready){loadStatus.textContent="Firebase is not configured yet. Add your web app settings in firebase-config.js to load and submit entries.";entryCount.textContent="Not connected";submitButton.disabled=true;}
else try{
 const app=initializeApp(firebaseConfig), db=getFirestore(app), projectsRef=collection(db,"projects");
 onSnapshot(query(projectsRef,orderBy("createdAt","desc")),(snapshot)=>{
  entryCount.textContent=snapshot.size+(snapshot.size===1?" entry":" entries");
  loadStatus.textContent=snapshot.empty?"No projects have been added yet.":"";
  entriesContainer.replaceChildren();
  snapshot.forEach(doc=>entriesContainer.appendChild(renderProject(doc.data())));
 },error=>{console.error(error);loadStatus.textContent="Could not load entries. Check Firebase configuration and Firestore rules.";entryCount.textContent="Unavailable";});
 form.addEventListener("submit",async event=>{
  event.preventDefault();if(!form.reportValidity())return;
  const data=new FormData(form), project={
   name:clean(data.get("name")),classRoll:clean(data.get("classRoll")),supervisor:clean(data.get("supervisor")),
   projectTitle:clean(data.get("projectTitle")),datasets:clean(data.get("datasets")),createdAt:serverTimestamp()
  };
  submitButton.disabled=true;submitButton.textContent="Submitting…";setStatus("","");
  try{await addDoc(projectsRef,project);form.reset();setStatus("Your project has been added to the shared list.","success");document.querySelector("#project-list").scrollIntoView({behavior:"smooth",block:"start"});}
  catch(error){console.error(error);setStatus("Submission failed. Check your Firebase setup and try again.","error");}
  finally{submitButton.disabled=false;submitButton.textContent="Submit project";}
 });
}catch(error){console.error(error);loadStatus.textContent="Firebase could not be initialized. Check firebase-config.js.";entryCount.textContent="Unavailable";}

function clean(value){return String(value??"").trim();}
function setStatus(message,type){formStatus.textContent=message;formStatus.className="status"+(type?" "+type:"");}
function renderProject(project){
 const article=document.createElement("article");article.className="entry-card";
 const top=document.createElement("div");top.className="entry-top";
 const name=document.createElement("h3");name.className="entry-name";name.textContent=project.name||"Unnamed";
 const roll=document.createElement("span");roll.className="entry-roll";roll.textContent="Roll: "+(project.classRoll||"—");top.append(name,roll);
 const title=document.createElement("p");title.className="entry-title";title.textContent=project.projectTitle||"Untitled project";
 const meta=document.createElement("div");meta.className="entry-meta";meta.append(makeMeta("Supervisor",project.supervisor||"Not specified"),makeMeta("Dataset(s)",project.datasets||"Not specified"));
 article.append(top,title,meta);return article;
}
function makeMeta(label,value){const wrap=document.createElement("div"),heading=document.createElement("span"),content=document.createElement("div");heading.className="meta-label";heading.textContent=label;content.className="meta-value";content.textContent=value;wrap.append(heading,content);return wrap;}