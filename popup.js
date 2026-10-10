'use strict';
const button = document.getElementById('extract');
const status = document.getElementById('status');
button.addEventListener('click', async () => {
  button.disabled = true;
  status.className = '';
  status.textContent = 'Reading the displayed X post…';
  try {
    const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
    if (!tab?.id || !/^https:\/\/(?:www\.|mobile\.)?(?:x\.com|twitter\.com)\//i.test(tab.url || ''))
      throw new Error('Open an X (Twitter) post first.');
    if (!/\/(?:status|i\/web\/status)\/\d+/i.test(new URL(tab.url).pathname))
      throw new Error('Open the individual post by clicking its date/time, so the URL contains /status/<post ID>.');
    let result;
    try {
      const injected = await chrome.scripting.executeScript({target:{tabId:tab.id},files:['extract.js']});
      result = injected?.[0]?.result;
    } catch (e) {
      result = {ok:false,error:e?.message || 'Unable to inspect the post'};
    }
    const post = result?.ok ? result : {
      ok:true,accountName:'',username:'',verified:'unknown',text:'',avatarURL:null,
      timestamp:{date:null,time:null,accuracy:'unavailable'},
      warning:'Extraction failed: '+(result?.error || 'Unknown error')+'. Enter the missing information manually.'
    };
    post.url = tab.url;
    if (!post.accountName || !post.username || !post.text?.trim() || !post.timestamp?.date) {
      post.warning = [post.warning,'Review the missing fields before exporting.'].filter(Boolean).join(' ');
    }
    const key = 'xpost_' + crypto.randomUUID();
    await chrome.storage.session.set({[key]:post});
    await chrome.tabs.create({url:chrome.runtime.getURL('report.html')+'?id='+encodeURIComponent(key)});
    status.textContent='Preview opened.';
    window.close();
  } catch(e) {
    status.textContent=e?.message || String(e);
    status.className='error';
  } finally {button.disabled=false;}
});
