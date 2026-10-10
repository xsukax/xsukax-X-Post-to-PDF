/*
 * No external dependencies. Edge's Canvas shapes multilingual text using locally
 * installed fonts, and a small PDF writer packages the rendered page images.
 * Direct-download PDFs are visually faithful and include a CLICKABLE source URL.
 * For SELECTABLE text, use the native Print / Save searchable PDF action.
 */
(function () {
  'use strict';
  const W=595.28, H=841.89, SCALE=2.4;
  const CARD={x:40,y:40,w:W-80};
  const LEFT=CARD.x+24, RIGHT=CARD.x+CARD.w-24, CONTENTW=RIGHT-LEFT;
  const LIMIT=H-71;
  const FONT='"Segoe UI","Noto Sans Arabic","Noto Sans Ethiopic",Arial,sans-serif';
  const enc=value=>new TextEncoder().encode(value);
  const decode64=value=>Uint8Array.from(atob(value),char=>char.charCodeAt(0));
  function safeName(data) {
    const account=String(data.username||data.accountName||'X Post')
      .replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').replace(/\s+/g,' ').slice(0,60).trim();
    return `${account||'X Post'} - ${data.timestamp?.date||'unknown-date'}.pdf`;
  }
  function safeURL(url) {
    try {
      const u=new URL(url);
      return u.protocol==='https:' && /^(?:www\.|mobile\.)?(?:x\.com|twitter\.com)$/i.test(u.hostname)
        && /\/(?:i\/web\/)?status\/\d+/i.test(u.pathname) ? url : null;
    } catch { return null; }
  }
  function pdfHex(value){return Array.from(enc(value),b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();}
  function makePDF(pages) {
    const hasLink=pages.some(p=>p.link);
    const linkId=hasLink?3+pages.length*3:null;
    const total=2+pages.length*3+(hasLink?1:0);
    const chunks=[],offsets=[0];let length=0;
    function add(value){const bytes=typeof value==='string'?enc(value):value;chunks.push(bytes);length+=bytes.length;}
    function begin(i){offsets[i]=length;add(`${i} 0 obj\n`);}
    function end(){add('\nendobj\n');}
    add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    begin(1);add('<< /Type /Catalog /Pages 2 0 R >>');end();
    begin(2);add(`<< /Type /Pages /Kids [${pages.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] /Count ${pages.length} >>`);end();
    for(let i=0;i<pages.length;i++){
      const obj=3+i*3,img=obj+1,content=obj+2,p=pages[i];
      const annot=p.link && linkId?` /Annots [${linkId} 0 R]`:'';
      begin(obj);add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${img} 0 R >> >> /Contents ${content} 0 R${annot} >>`);end();
      begin(img);add(`<< /Type /XObject /Subtype /Image /Width ${Math.round(W*SCALE)} /Height ${Math.round(H*SCALE)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
      add(p.jpeg);add('\nendstream');end();
      const stream=`q\n${W} 0 0 ${H} 0 0 cm\n/Im0 Do\nQ\n`;
      begin(content);add(`<< /Length ${enc(stream).length} >>\nstream\n${stream}endstream`);end();
    }
    if(hasLink){
      const source=pages.find(p=>p.link).link;
      const {top,bottom}=source;
      begin(linkId);
      add(`<< /Type /Annot /Subtype /Link /Rect [${LEFT} ${H-bottom} ${RIGHT} ${H-top}] /Border [0 0 0] /A << /S /URI /URI <${pdfHex(source.url)}> >> >>`);
      end();
    }
    const xref=length;
    add(`xref\n0 ${total+1}\n0000000000 65535 f \n`);
    for(let i=1;i<=total;i++) add(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`);
    add(`trailer\n<< /Size ${total+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
    const out=new Uint8Array(length);let position=0;
    for(const b of chunks){out.set(b,position);position+=b.length;}
    return new Blob([out],{type:'application/pdf'});
  }
  const graphemes=value=>typeof Intl.Segmenter==='function'
    ? Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(value),e=>e.segment)
    : Array.from(value);
  const rtl=value=>{const char=(value.match(/[\p{Script=Arabic}\p{Script=Hebrew}A-Za-z\p{Script=Ethiopic}]/u)||[])[0];return Boolean(char&&/[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(char));};
  function dateString(stamp){
    if(!stamp?.date)return 'Publication date unavailable';
    const m=/^(\d{4})-(\d\d)-(\d\d)$/.exec(stamp.date);
    let date=m?new Date(+m[1],+m[2]-1,+m[3],12).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}):stamp.date;
    if(stamp.time){
      const t=/^(\d{2}):(\d{2})$/.exec(stamp.time);
      date += ' · ' +(t? `${(+t[1])%12||12}:${t[2]} ${(+t[1])>=12?'PM':'AM'}`:stamp.time);
    }
    return date+(/approximate|inferred/i.test(stamp.accuracy||'')?' (approx.)':'');
  }
  function initial(name){
    const trimmed=String(name||'').trim();
    return (graphemes(trimmed)[0]||'X').toLocaleUpperCase();
  }
  async function loadAvatar(data) {
    if (typeof data.avatarData !== 'string' ||
        !/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(data.avatarData) ||
        data.avatarData.length > 5 * 1024 * 1024) return null;
    return new Promise(resolve => {
      const image = new Image();
      image.onload = () => resolve(image.naturalWidth && image.naturalHeight ? image : null);
      image.onerror = () => resolve(null);
      image.src = data.avatarData;
    });
  }
  async function renderPages(data,onProgress){
    const avatarImage = await loadAvatar(data);
    const pages=[];let canvas,ctx,y,pageNo=0,link;
    const displayName=data.accountName||'Unknown X account';
    const username=data.username||'@unknown';
    const verified=data.verified==='verified';
    const pubDate=dateString(data.timestamp);
    const url=safeURL(data.url);
    if(!url)throw new Error('The original post URL was missing or invalid.');
    function setFont(size,weight='normal'){ctx.font=`${weight} ${size}px ${FONT}`;}
    function roundRect(x,y,w,h,r){
      if(ctx.roundRect){ctx.beginPath();ctx.roundRect(x,y,w,h,r);return;}
      ctx.beginPath();ctx.rect(x,y,w,h);
    }
    function verifiedIcon(x,cy,r=8){
      ctx.save();ctx.fillStyle='#1d9bf0';
      ctx.beginPath();
      for(let i=0;i<16;i++){
        const a=-Math.PI/2+i*Math.PI/8,rad=i%2===0?r:r*.87;
        const px=x+Math.cos(a)*rad,py=cy+Math.sin(a)*rad;
        if(!i)ctx.moveTo(px,py);else ctx.lineTo(px,py);
      }
      ctx.closePath();ctx.fill();
      ctx.strokeStyle='#fff';ctx.lineWidth=1.8;ctx.lineCap='round';ctx.lineJoin='round';
      ctx.beginPath();ctx.moveTo(x-r*.46,cy);ctx.lineTo(x-r*.07,cy+r*.33);ctx.lineTo(x+r*.51,cy-r*.39);ctx.stroke();ctx.restore();
    }
    function drawX(x,y,scale=1){
      ctx.save();ctx.strokeStyle='#0f1419';ctx.lineCap='butt';ctx.lineWidth=2.4*scale;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+15*scale,y+18*scale);
      ctx.moveTo(x+12*scale,y);ctx.lineTo(x+3*scale,y+18*scale);ctx.stroke();ctx.restore();
    }
    function avatar(x,cy,r){
      if (avatarImage) {
        const w=avatarImage.naturalWidth,h=avatarImage.naturalHeight;
        const side=Math.min(w,h), sx=(w-side)/2,sy=(h-side)/2;
        ctx.save();ctx.beginPath();ctx.arc(x,cy,r,0,Math.PI*2);ctx.clip();
        ctx.drawImage(avatarImage,sx,sy,side,side,x-r,cy-r,2*r,2*r);
        ctx.restore();
      } else {
        ctx.fillStyle='#0f1419';ctx.beginPath();ctx.arc(x,cy,r,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#fff';ctx.textAlign='center';ctx.direction='ltr';setFont(r, 'bold');ctx.fillText(initial(displayName),x,cy+r*.38);ctx.textAlign='left';
      }
    }
    function beginPage(){
      if(canvas)finishPage(false);
      ++pageNo;
      canvas=document.createElement('canvas');
      canvas.width=Math.round(W*SCALE);canvas.height=Math.round(H*SCALE);
      ctx=canvas.getContext('2d',{alpha:false});
      if(!ctx)throw new Error('Canvas unavailable; use the Print / Save searchable PDF option.');
      ctx.setTransform(SCALE,0,0,SCALE,0,0);
      ctx.fillStyle='#f5f7f8';ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#fff';ctx.fillRect(CARD.x,CARD.y,CARD.w,H-CARD.y-40);
      if(pageNo===1){
        avatar(LEFT+21,76,21);
        ctx.fillStyle='#0f1419';setFont(14,'bold');ctx.textAlign='left';ctx.direction='ltr';
        const nameLines=wrap(displayName,14,CONTENTW-105);
        const headerY=72;
        const n=Math.min(2,nameLines.length);
        for(let i=0;i<n;i++)ctx.fillText(nameLines[i],LEFT+53,headerY+i*18);
        if(verified){
          setFont(14,'bold');
          const tail=nameLines[n-1]||'';
          const center=Math.min(RIGHT-31, LEFT+53+ctx.measureText(tail).width+14);
          verifiedIcon(center,headerY+(n-1)*18-4,8.2);
        }
        const handleY=headerY+n*18+1;
        ctx.fillStyle='#536471';setFont(10.7);ctx.fillText(username,LEFT+53,handleY);
        drawX(RIGHT-19,62,1);
        y=Math.max(145,handleY+26);
      } else {
        avatar(LEFT+15,73,15);
        ctx.fillStyle='#0f1419';setFont(10.5,'bold');ctx.fillText(displayName,LEFT+38,74);
        if(verified){let xx=Math.min(RIGHT-45,LEFT+38+ctx.measureText(displayName).width+12);verifiedIcon(xx,70,6.2);}
        ctx.fillStyle='#536471';setFont(9.4);ctx.fillText(username+' · continued',LEFT+38,88);
        drawX(RIGHT-17,63,.75);
        y=120;
      }
    }
    function finishPage(isLast){
      const cardEnd=isLast?Math.min(H-41,Math.max(y+20,210)):H-41;
      // Remove the unused white area beneath the final card, leaving a gray canvas.
      if(isLast && cardEnd<H-40){ctx.fillStyle='#f5f7f8';ctx.fillRect(CARD.x,cardEnd,CARD.w,H-cardEnd-40);}
      ctx.strokeStyle='#d4d8df';ctx.lineWidth=.8;roundRect(CARD.x,CARD.y,CARD.w,cardEnd-CARD.y,7);ctx.stroke();
      const dataURL=canvas.toDataURL('image/jpeg',.93);
      pages.push({jpeg:decode64(dataURL.slice(dataURL.indexOf(',')+1)),link});
      canvas.width=0;canvas.height=0;canvas=null;ctx=null;link=null;
    }
    function ensure(height){if(y+height>LIMIT)beginPage();}
    function wrap(input,size,maxWidth=CONTENTW){
      const value=String(input);
      if(!value)return [''];
      setFont(size);
      const tokens=value.match(/\s+|\S+/gu)||[value],out=[];
      let line='';
      const split=(token)=>{
        let part='';
        for(const unit of graphemes(token)){
          if(part&&ctx.measureText(part+unit).width>maxWidth){out.push(part);part=unit;}
          else part+=unit;
        }
        return part;
      };
      for(const token of tokens){
        if(ctx.measureText(line+token).width<=maxWidth){line+=token;continue;}
        if(line){out.push(line);line='';}
        if(ctx.measureText(token).width<=maxWidth)line=token;
        else line=split(token);
      }
      if(line)out.push(line);
      return out.length?out:[''];
    }
    function line(input,size=11.4,height=18.7,color='#050505'){
      const sublines=wrap(input,size);
      for(const segment of sublines){
        ensure(height);
        ctx.fillStyle=color;setFont(size);
        if(rtl(segment)){ctx.textAlign='right';ctx.direction='rtl';ctx.fillText(segment,RIGHT,y);}
        else{ctx.textAlign='left';ctx.direction='ltr';ctx.fillText(segment,LEFT,y);}
        y+=height;
      }
      ctx.textAlign='left';ctx.direction='ltr';
    }
    function drawActions(){
      const rowHeight=48;
      ensure(rowHeight+68);
      y+=10;
      ctx.strokeStyle='#eff3f4';ctx.lineWidth=.9;
      ctx.beginPath();ctx.moveTo(LEFT,y);ctx.lineTo(RIGHT,y);ctx.stroke();
      const cy=y+23;
      ctx.save();ctx.strokeStyle='#536471';ctx.lineWidth=1.35;ctx.lineCap='round';ctx.lineJoin='round';
      const places=[LEFT+CONTENTW*.16,LEFT+CONTENTW*.39,LEFT+CONTENTW*.62,LEFT+CONTENTW*.85];
      // Reply bubble
      ctx.beginPath();ctx.ellipse(places[0],cy,8.4,7,0,0,Math.PI*2);ctx.moveTo(places[0]-4,cy+6);ctx.lineTo(places[0]-7,cy+11);ctx.lineTo(places[0]+1,cy+7);ctx.stroke();
      // Repost arrows
      let x=places[1];ctx.beginPath();ctx.moveTo(x-9,cy-5);ctx.lineTo(x+7,cy-5);ctx.lineTo(x+4,cy-8);ctx.moveTo(x+7,cy-5);ctx.lineTo(x+4,cy-2);ctx.moveTo(x+9,cy+5);ctx.lineTo(x-7,cy+5);ctx.lineTo(x-4,cy+2);ctx.moveTo(x-7,cy+5);ctx.lineTo(x-4,cy+8);ctx.stroke();
      // Like heart, no invented reaction count
      x=places[2];ctx.beginPath();ctx.moveTo(x,cy+8);ctx.bezierCurveTo(x-6,cy+3,x-10,cy-1,x-8,cy-5);ctx.bezierCurveTo(x-7,cy-10,x-2,cy-9,x,cy-5);ctx.bezierCurveTo(x+2,cy-9,x+7,cy-10,x+8,cy-5);ctx.bezierCurveTo(x+10,cy-1,x+6,cy+3,x,cy+8);ctx.stroke();
      // Share
      x=places[3];ctx.beginPath();ctx.moveTo(x,cy+4);ctx.lineTo(x,cy-9);ctx.moveTo(x-5,cy-4);ctx.lineTo(x,cy-9);ctx.lineTo(x+5,cy-4);ctx.moveTo(x-8,cy+2);ctx.lineTo(x-8,cy+8);ctx.lineTo(x+8,cy+8);ctx.lineTo(x+8,cy+2);ctx.stroke();
      ctx.restore();y+=rowHeight;
    }
    function drawURL(){
      const label='ORIGINAL X POST URL';
      const linkLines=wrap(url,8.8,CONTENTW);
      const height=45+14.4*linkLines.length;
      ensure(height+12);
      const start=y;
      ctx.fillStyle='#f8fafb';ctx.fillRect(CARD.x+1,start,CARD.w-2,height);
      ctx.strokeStyle='#eff3f4';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(CARD.x+1,start);ctx.lineTo(CARD.x+CARD.w-1,start);ctx.stroke();
      ctx.fillStyle='#65676b';setFont(8.5,'bold');ctx.fillText(label,LEFT,start+20);
      ctx.fillStyle='#1d9bf0';setFont(8.8);
      linkLines.forEach((part,i)=>ctx.fillText(part,LEFT,start+38+14.4*i));
      link={url,top:start+23,bottom:Math.min(start+height,start+39+14.4*linkLines.length)};
      y=start+height;
    }
    beginPage();
    const paragraphs=String(data.text??'').replace(/\r\n?/g,'\n').split('\n');
    for(let i=0;i<paragraphs.length;i++){
      line(paragraphs[i],11.5,18.4);
      if(i>0 && i%45===0){onProgress?.(`Rendering text… (${i+1}/${paragraphs.length} paragraphs)`);await new Promise(requestAnimationFrame);}
      if(pageNo>300)throw new Error('More than 300 pages; the post text may be unexpectedly large.');
    }
    y+=8;
    line(pubDate,10.5,19,'#536471');
    drawActions();
    drawURL();
    finishPage(true);
    return pages;
  }
  async function download(data,onProgress){
    onProgress?.('Rendering X-style pages (multilingual text supported)…');
    const pages=await renderPages(data,onProgress);
    onProgress?.(`Assembling ${pages.length}-page PDF…`);
    const blob=makePDF(pages);
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=safeName(data);
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    return {pages:pages.length,bytes:blob.size};
  }
  window.XPostPdfExport={download};
})();
