'use strict';
const el = id => document.getElementById(id);
const notice = el('notice');
let payload, original, avatarSequence=0, avatarPending=Promise.resolve();
const iconFallback=name=>{
  const v=String(name||'').trim();
  return (typeof Intl.Segmenter==='function'
   ? (new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(v)[Symbol.iterator]().next().value?.segment||'X')
   : (Array.from(v)[0]||'X')).toLocaleUpperCase();
};
function validPostURL(value){
  try{const u=new URL(value);return u.protocol==='https:' && /^(?:www\.|mobile\.)?(?:x\.com|twitter\.com)$/i.test(u.hostname)
    && /\/(?:i\/web\/)?status\/\d+/i.test(u.pathname);}
  catch{return false;}
}
function validAvatarURL(value){
  try{const u=new URL(value);return u.protocol==='https:' && u.hostname==='pbs.twimg.com'
      && /\/profile_images\//.test(u.pathname) && u.href.length<4096;}
  catch{return false;}
}
function displayDate(stamp){
  if(!stamp?.date) return 'Publication date unavailable';
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(stamp.date);
  let v=m?new Date(+m[1],+m[2]-1,+m[3],12).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}):stamp.date;
  if(stamp.time){
    const tm=/^(\d\d):(\d\d)$/.exec(stamp.time);
    let value=stamp.time;
    if(tm){const h=Number(tm[1]);value=`${h%12||12}:${tm[2]} ${h>=12?'PM':'AM'}`;}
    v+=' · '+value;
  }
  if(/approximate|inferred/i.test(stamp.accuracy||''))v+=' (approx.)';
  return v;
}
function setPhoto(uri){
  const img=el('avatar-image');
  img.hidden=!uri;el('avatar-letter').hidden=Boolean(uri);
  if(uri)img.src=uri;else img.removeAttribute('src');
}
async function fileToDataURL(blob){
  return await new Promise((resolve,reject)=>{
    const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Cannot read avatar image'));r.readAsDataURL(blob);
  });
}
async function useAvatarURL(url){
  const token=++avatarSequence;payload.avatarURL=url||null;payload.avatarData=null;setPhoto(null);
  if(!url){el('avatar-status').textContent='Original profile photo unavailable; initial-letter avatar will be used.';return;}
  if(!validAvatarURL(url)){el('avatar-status').textContent='Use an HTTPS pbs.twimg.com/profile_images/ URL.';return;}
  el('avatar-status').textContent='Loading original X profile photo…';
  try{
    const response=await fetch(url,{credentials:'omit',redirect:'follow'});
    if(!response.ok)throw new Error('HTTP '+response.status);
    if(!validAvatarURL(response.url))throw new Error('Unexpected redirect outside X profile-image CDN');
    const mime=(response.headers.get('content-type')||'').split(';')[0].trim();
    if(!/^image\/(?:png|jpeg|webp|gif)$/i.test(mime))throw new Error('Unsupported image format');
    const blob=await response.blob();if(blob.size>3*1024*1024)throw new Error('Profile photo larger than 3 MB');
    const uri=await fileToDataURL(blob);
    if(token!==avatarSequence)return;
    await new Promise((resolve,reject)=>{const test=new Image();test.onload=resolve;test.onerror=()=>reject(new Error('Invalid photo'));test.src=uri;});
    if(token!==avatarSequence)return;
    payload.avatarData=uri;setPhoto(uri);
    el('avatar-status').textContent='Original account avatar loaded for both PDF export methods.';
  }catch(err){if(token===avatarSequence){
    el('avatar-status').textContent='Photo unavailable ('+(err?.message||'load error')+'). Using initial-letter avatar.';
  }}
}
async function useAvatarFile(file){
  const token=++avatarSequence;payload.avatarData=null;payload.avatarURL=null;setPhoto(null);
  if(!file)return;
  if(!/^image\/(?:png|jpeg|webp|gif)$/.test(file.type)||file.size>3*1024*1024){
    el('avatar-status').textContent='Choose PNG, JPEG, WebP, or GIF under 3 MB.';return;
  }
  try{
    const uri=await fileToDataURL(file);
    await new Promise((resolve,reject)=>{const test=new Image();test.onload=resolve;test.onerror=()=>reject(new Error('Invalid image'));test.src=uri;});
    if(token!==avatarSequence)return;
    payload.avatarData=uri;setPhoto(uri);
    el('edit-avatar-url').value='';
    el('avatar-status').textContent='Local avatar loaded and included in both PDFs.';
  }catch(e){if(token===avatarSequence)el('avatar-status').textContent=e?.message||'Could not use image';}
}
function normalizedHandle(value){
  const cleaned=String(value||'').trim().replace(/^@+/,'');
  return cleaned?'@'+cleaned:'';
}
function updatePreview(){
  payload.accountName=el('edit-name').value;
  payload.username=normalizedHandle(el('edit-username').value);
  payload.verified=el('edit-verified').value;
  const date=el('edit-date').value;
  const time=el('edit-time').value;
  const changed=date!==(original.timestamp?.date||'')||time!==(original.timestamp?.time||'');
  payload.timestamp={date:date||null,time:time||null,accuracy:changed?'manual correction':original.timestamp?.accuracy};
  payload.text=el('edit-text').value;
  payload.url=el('edit-url').value.trim();
  el('account-name').textContent=payload.accountName||'Unknown account';
  el('username').textContent=payload.username||'@unknown';
  el('verified-badge').hidden=payload.verified!=='verified';
  el('date').textContent=displayDate(payload.timestamp);
  el('post-text').textContent=payload.text;
  el('avatar-letter').textContent=iconFallback(payload.accountName);
  el('source').textContent=payload.url;
  if(validPostURL(payload.url)){el('source').href=payload.url;}else{el('source').removeAttribute('href');}
  el('character-count').textContent=Array.from(payload.text).length.toLocaleString()+' characters';
}
function applyToEditor(data){
  el('edit-name').value=data.accountName||'';
  el('edit-username').value=data.username||'';
  el('edit-verified').value=['verified','not_verified','unknown'].includes(data.verified)?data.verified:'unknown';
  el('edit-date').value=/^\d{4}-\d{2}-\d{2}$/.test(data.timestamp?.date||'')?data.timestamp.date:'';
  el('edit-time').value=/^\d{2}:\d{2}$/.test(data.timestamp?.time||'')?data.timestamp.time:'';
  el('edit-text').value=data.text||'';
  el('edit-url').value=data.url||'';
  el('edit-avatar-url').value=data.avatarURL||'';
  el('edit-avatar-file').value='';
  updatePreview();
  avatarPending=useAvatarURL(el('edit-avatar-url').value);
}
function exportError(){
  if(!payload.accountName.trim())return 'Enter the account name before exporting.';
  if(!/^@[A-Za-z0-9_]{1,15}$/.test(payload.username))return 'Enter a valid X @username (letters, numbers, underscores, up to 15 characters).';
  if(!validPostURL(payload.url))return 'Enter a valid original X/Twitter post URL containing /status/<post ID>.';
  return '';
}
async function main(){
  const id=new URLSearchParams(location.search).get('id');
  if(!/^xpost_[\w-]+$/.test(id||''))throw new Error('No extraction ID supplied; reopen the X post.');
  const stored=await chrome.storage.session.get(id);
  payload=stored[id];
  if(!payload?.ok||typeof payload.text!=='string')throw new Error('The extracted X post is no longer available in this browser session.');
  original=structuredClone(payload);
  el('report').hidden=false;el('editor').hidden=false;
  applyToEditor(original);
  const warnings=[];
  if(!payload.accountName||!payload.username)warnings.push('Account name or username not detected.');
  if(!payload.timestamp?.date)warnings.push('Publication date not found.');
  if(!payload.text?.trim())warnings.push('No post text extracted. This may be a media-only post.');
  if(payload.verified==='unknown')warnings.push('Verification not established.');
  if(payload.warning)warnings.push(payload.warning);
  notice.textContent=warnings.length?warnings.join(' '):'Review the extracted post, then export your PDF.';
  notice.className='notice no-print'+(warnings.length?' warning':'');
  for(const id of ['edit-name','edit-username','edit-verified','edit-date','edit-time','edit-text','edit-url']){
    el(id).addEventListener(id==='edit-verified'?'change':'input',updatePreview);
  }
  el('edit-avatar-url').addEventListener('change',()=>{avatarPending=useAvatarURL(el('edit-avatar-url').value.trim());});
  el('edit-avatar-file').addEventListener('change',()=>{avatarPending=useAvatarFile(el('edit-avatar-file').files[0]);});
  el('reset').addEventListener('click',()=>{applyToEditor(original);notice.className='notice no-print';notice.textContent='Extracted values restored.';});
  el('download').addEventListener('click',async()=>{
    updatePreview();const issue=exportError();if(issue){notice.className='notice error no-print';notice.textContent=issue;return;}
    el('download').disabled=true;notice.className='notice no-print';notice.textContent='Creating PDF locally…';
    try{await avatarPending;await window.XPostPdfExport.download(payload,msg=>notice.textContent=msg);
      notice.textContent='PDF download started.';
    }catch(err){notice.className='notice error no-print';notice.textContent='PDF generation failed: '+(err?.message||String(err));}
    finally{el('download').disabled=false;}
  });
  el('print').addEventListener('click',async()=>{
    updatePreview();const issue=exportError();if(issue){notice.className='notice error no-print';notice.textContent=issue;return;}
    await avatarPending;window.print();
  });
}
main().catch(e=>{notice.textContent=e?.message||String(e);notice.className='notice error no-print';});
