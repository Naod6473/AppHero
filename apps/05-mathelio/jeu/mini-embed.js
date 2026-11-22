(()=>{
 if(window.parent===window)return;
 document.documentElement.classList.add('mini-embedded');
 document.addEventListener('click',e=>{const link=e.target.closest('a[href]');if(!link)return;const url=new URL(link.href);if(url.origin===location.origin&&url.pathname.endsWith('/index.html')){e.preventDefault();parent.document.querySelector(`[data-view="${url.hash.slice(1)||'minigames'}"]`)?.click();}});
 const comfort=()=>{document.body.classList.toggle('learning-calm',parent.document.body.classList.contains('learning-calm'));document.body.classList.toggle('learning-large',parent.document.body.classList.contains('learning-large'));};new MutationObserver(comfort).observe(parent.document.body,{attributes:true,attributeFilter:['class']});comfort();
 const resize=()=>{const frame=window.frameElement;if(frame)frame.style.height=Math.max(550,document.body.scrollHeight+40)+'px';};
 new ResizeObserver(resize).observe(document.body);resize();
})();
