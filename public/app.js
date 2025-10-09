(function(){
  const form = document.getElementById('add-form');
  const result = document.getElementById('result');
  const codeEl = document.getElementById('code');
  const qttyEl = document.getElementById('qtty');

  function setResult(ok, message){
    result.innerHTML = `<span class="${ok ? 'ok' : 'err'}">${message}</span>`;
  }

  function toQuery(params){
    return Object.entries(params)
      .map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
  }

  async function addItem(code, qtty){
    const query = toQuery({ code: code.trim(), qtty: String(qtty).trim() });
    const url = `/addItem?${query}`;
    const res = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
    if(!res.ok){
      const text = await res.text().catch(()=> 'Request failed');
      throw new Error(text || 'Request failed');
    }
    return res.json();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = codeEl.value;
    const qtty = qttyEl.value;

    if(!code || !qtty){
      setResult(false, 'Please fill in both fields');
      return;
    }

    try{
      const resp = await addItem(code, qtty);
      if(resp && resp.ok){
        setResult(true, `Saved: ${resp.written}`);
        // Clear quantity but keep code for fast repeated scanning/entry
        qttyEl.value = '1';
        qttyEl.focus();
      }else{
        setResult(false, resp && resp.error ? resp.error : 'Unknown error');
      }
    }catch(err){
      try{
        const j = JSON.parse(String(err.message));
        setResult(false, j.error || 'Failed');
      }catch(_){
        setResult(false, String(err.message || 'Failed'));
      }
    }
  });
})();
