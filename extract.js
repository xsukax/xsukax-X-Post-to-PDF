/* xsukax X Post PDF — DOM extraction from a visible X status page.
   Intentionally no network calls, no private X APIs, and no page-script injection.
   File-source HTML is an X bootstrap shell: React adds the actual tweet later. */
(() => {
  'use strict';
  const squish = v => String(v || '').replace(/[\u200b-\u200d\ufeff]/g,'').replace(/\s+/g,' ').trim();
  const url = location.href;
  const pathname = location.pathname;
  const statusMatch = pathname.match(/\/(?:i\/web\/)?status\/(\d+)/i);
  const postId = statusMatch?.[1] || '';
  const getHref = el => {try{return new URL(el.getAttribute('href')||'',location.origin);}catch{return null;}};
  const statusId = href => (href?.pathname || '').match(/\/(?:i\/web\/)?status\/(\d+)/i)?.[1] || '';
  const profileHandle = href => {
    const m=(href?.pathname||'').match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
    if (!m || /^(?:home|explore|i|search|messages|settings|notifications|compose|login|signup|share)$/i.test(m[1])) return '';
    return m[1];
  };
  function isVisible(el){
    if(!el || el.closest('[hidden],[aria-hidden="true"]'))return false;
    if (typeof getComputedStyle === 'function'){
      const s=getComputedStyle(el);if(s.display==='none'||s.visibility==='hidden')return false;
    }
    return true;
  }
  function findArticle(){
    const pool=Array.from(document.querySelectorAll('article[data-testid="tweet"], article[role="article"], article'));
    const articles=[...new Set(pool)].filter(e=>isVisible(e));
    if(!articles.length)return null;
    const rated=articles.map((article,index)=>{
      let score=0;
      if(article.matches('[data-testid="tweet"]'))score+=15;
      if(article.closest('[data-testid="primaryColumn"],main[role="main"]'))score+=10;
      if(article.querySelector('[data-testid="tweetText"]'))score+=10;
      if(article.querySelector('[data-testid="User-Name"]'))score+=10;
      const times=Array.from(article.querySelectorAll('time'));
      const directTimes=times.filter(t=>t.closest('article')===article);
      if(directTimes.length)score+=5;
      if(postId){
        const ownMatch=directTimes.some(t=>statusId(getHref(t.closest('a[href]')) )===postId);
        const matches=Array.from(article.querySelectorAll('a[href]')).some(a=>a.closest('article')===article && statusId(getHref(a))===postId);
        if(ownMatch)score+=1000;
        else if(matches)score+=300;
      }
      // Do not accidentally extract an embedded quote as the top-level post.
      if(article.parentElement?.closest('article'))score-=600;
      return {article,score,index};
    }).sort((a,b)=>b.score-a.score||a.index-b.index);
    return rated[0].article;
  }
  function nearestOwn(article,selector){
    return Array.from(article.querySelectorAll(selector)).find(el=>el.closest('article')===article)||null;
  }
  function accountDetails(article){
    const user=nearestOwn(article,'[data-testid="User-Name"]') || nearestOwn(article,'[data-testid="user-name"]');
    const area=user||article;
    let handle='';
    const links=Array.from(area.querySelectorAll('a[href]')).filter(a=>a.closest('article')===article);
    for(const a of links){
      const displayed=(a.innerText||a.textContent||'');
      const found=displayed.match(/@([A-Za-z0-9_]{1,15})(?![A-Za-z0-9_])/);
      const fromHref=profileHandle(getHref(a));
      if(found && (!fromHref || fromHref.toLowerCase()===found[1].toLowerCase())){handle=found[1];break;}
    }
    if(!handle){
      for(const a of links){
        const candidate=profileHandle(getHref(a));
        if(candidate){handle=candidate;break;}
      }
    }
    if(!handle){
      handle=pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/\d+/i)?.[1] || '';
    }
    const rawUsername=handle ? '@'+handle : '';
    let name='';
    const authorLink=links.find(a=>profileHandle(getHref(a)).toLowerCase()===handle.toLowerCase() && handle)
      || links.find(a=>Boolean(profileHandle(getHref(a))));
    if(authorLink){
      const named=Array.from(authorLink.querySelectorAll('span')).map(e=>squish(e.innerText||e.textContent))
        .filter(s=>s && !s.startsWith('@') && !/^(?:verified|follow|follows you)$/i.test(s));
      // The first nonempty display span normally holds X's account display name.
      name=named[0] || '';
      if(!name){
        name=squish(authorLink.innerText||authorLink.textContent).split('\n').map(squish).find(t=>t && !t.startsWith('@')) || '';
      }
    }
    if(!name && user){
      const text=(user.innerText||user.textContent||'').split('\n').map(squish);
      name=text.find(t=>t && !t.startsWith('@') && !/verified|follow/i.test(t))||'';
    }
    if(name===rawUsername)name='';
    let verified='unknown';
    if(user){
      const badge=Array.from(user.querySelectorAll('svg,[aria-label],[data-testid]')).some(el=>{
        const testid=el.getAttribute('data-testid')||'';
        const aria=el.getAttribute('aria-label')||'';
        const title=el.getAttribute('title')||'';
        return /(?:^|[-_])(?:icon[-_]?)?verified(?:$|[-_])/i.test(testid) ||
          /\bverified(?: account| organization| business| government)?\b/i.test(aria+' '+title) ||
          (el.localName==='svg' && /\bverified\b/i.test(el.textContent||''));
      });
      verified=badge ? 'verified' : 'not_verified';
    }
    return {accountName:name,username:rawUsername,verified};
  }
  function avatarURL(article){
    const selectors=[
      '[data-testid^="UserAvatar-Container-"] img',
      '[data-testid="Tweet-User-Avatar"] img',
      '[data-testid^="UserAvatar-"] img',
      '[data-testid="User-Name"] img'
    ];
    let img=null;
    for(const sel of selectors){img=nearestOwn(article,sel);if(img)break;}
    // Fallback only for account profile-image URLs, never tweet media.
    if(!img)img=nearestOwn(article,'img[src*="pbs.twimg.com/profile_images/"]');
    if(!img)return null;
    const candidates=[img.currentSrc,img.getAttribute('src'),img.getAttribute('data-src')];
    for(const candidate of candidates){
      try{const u=new URL(candidate,location.origin);
        if(u.protocol==='https:'&&u.hostname==='pbs.twimg.com'&&/\/profile_images\//.test(u.pathname))return u.href;
      }catch{}
    }
    return null;
  }
  function textWithEmoji(node){
    const copy=node.cloneNode(true);
    for(const br of copy.querySelectorAll('br'))br.replaceWith(document.createTextNode('\n'));
    for(const img of copy.querySelectorAll('img')){
      const alt=img.getAttribute('alt') || '';
      // X represents emojis as text or emoji image nodes; never add media descriptions.
      img.replaceWith(document.createTextNode(alt && alt.length<=20?alt:''));
    }
    for(const element of copy.querySelectorAll('script,style,[aria-hidden="true"]'))element.remove();
    let value=copy.textContent || '';
    value=value.replace(/\r\n?/g,'\n').replace(/[\u200b\ufeff]/g,'');
    return value.trim();
  }
  function getText(article){
    const target=nearestOwn(article,'[data-testid="tweetText"], [data-testid="longformRichTextComponent"]');
    if(!target)return '';
    return textWithEmoji(target);
  }
  function pad(n){return String(n).padStart(2,'0');}
  function formatTimestamp(d,accuracy){
    return {date:`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,
      time:`${pad(d.getHours())}:${pad(d.getMinutes())}`,
      timezone:Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      accuracy:accuracy||'exact'};
  }
  function parseTime(article){
    const times=Array.from(article.querySelectorAll('time')).filter(t=>t.closest('article')===article);
    const selected=times.find(t=>statusId(getHref(t.closest('a[href]')) )===postId) || times[0];
    if(selected){
      const raw=selected.getAttribute('datetime');
      if(raw){const d=new Date(raw);if(!Number.isNaN(d.getTime()))return formatTimestamp(d,'exact');}
      const visible=squish(selected.innerText||selected.textContent||selected.getAttribute('aria-label'));
      const relative=parseRelative(visible);
      if(relative)return relative;
    }
    // X sometimes has a fully spelled-out timestamp next to the status header.
    for(const node of article.querySelectorAll('[datetime],[title],[aria-label]')){
      if(node.closest('article')!==article)continue;
      const dateText=node.getAttribute('datetime')||node.getAttribute('title')||node.getAttribute('aria-label')||'';
      const abs=new Date(dateText);
      if(/\d{4}/.test(dateText) && !isNaN(abs.getTime()) && /(?:\d{4}-\d\d-\d\d|\b\d{4}\b)/.test(dateText))return formatTimestamp(abs,'exact');
      const r=parseRelative(dateText);if(r)return r;
    }
    return {date:null,time:null,timezone:'',accuracy:'unavailable'};
  }
  function parseRelative(raw){
    const v=squish(raw).toLowerCase();
    if(!v)return null;
    const now=new Date();
    if(/^(?:just now|now|a moment ago|0\s*[smh]|0\s*(?:seconds?|minutes?|hours?)\s*ago)$/.test(v))return formatTimestamp(now,'approximate');
    if(/^yesterday(?:\b|$)/.test(v)){const d=new Date(now);d.setDate(d.getDate()-1);return formatTimestamp(d,'approximate');}
    let m=v.match(/^(\d{1,4})\s*(s|sec(?:onds?)?|m|min(?:utes?)?|h|hr|hrs|hours?|d|days?)\s*(?:ago)?$/i);
    if(m){const n=Number(m[1]);if(n>3650)return null;const u=m[2].charAt(0);
      const d=new Date(now.getTime()-n*({'s':1000,'m':60000,'h':3600000,'d':86400000}[u]||0));
      return formatTimestamp(d,'approximate');}
    return null;
  }
  if(!postId)return {ok:false,error:'This is not an individual X status URL.'};
  const article=findArticle();
  if(!article)return {ok:false,error:'X did not render an article yet. Wait until the post loads, then try again.'};
  const author=accountDetails(article);
  const stamp=parseTime(article);
  const text=getText(article);
  const avatar=avatarURL(article);
  const warning=[];
  if(!author.accountName)warning.push('Account name not detected.');
  if(!author.username)warning.push('@username not detected.');
  if(!stamp.date)warning.push('Publication timestamp not detected.');
  if(!text)warning.push('Post text not detected (it may contain media only or require expansion).');
  if(author.verified==='unknown')warning.push('Verification could not be determined.');
  if(!Array.from(article.querySelectorAll('time')).some(t=>statusId(getHref(t.closest('a[href]')) )===postId))
    warning.push('Could not match the post ID to a timestamp link; review extracted author and date.');
  return {ok:true,accountName:author.accountName,username:author.username,verified:author.verified,
    avatarURL:avatar,text,timestamp:stamp,url,warning:warning.join(' ')};
})()
