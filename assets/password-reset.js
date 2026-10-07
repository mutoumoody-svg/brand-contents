(function () {
  const $ = id => document.getElementById(id);
  const message = (text,error=false) => { $('resetMessage').textContent=text; $('resetMessage').className=error?'review':'muted'; };
  let enabled=false, deadline=0, sending=false;
  async function post(url,body) {
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error?.message || data.error || '请求失败');
    return data;
  }
  $('sendCode').onclick=async()=>{
    if(!$('resetEmail').reportValidity())return;
    sending=true;$('sendCode').disabled=true;
    try{
      const data=await post('/api/auth/password-reset/request',{email:$('resetEmail').value.trim()});
      deadline=Date.now()+60000;message(data.message);$('resetCode').focus();
    }catch(err){message(err.message,true);}
    finally{sending=false;$('sendCode').disabled=!enabled || deadline>Date.now();}
  };
  setInterval(()=>{
    const left=Math.max(0,Math.ceil((deadline-Date.now())/1000));
    $('sendCode').textContent=left?`${left}秒后重发`:'获取验证码';
    if(!left)$('sendCode').disabled=!enabled || sending;
  },1000);
  $('showPassword').onchange=()=>{ for(const id of ['resetPassword','resetConfirm'])$(id).type=$('showPassword').checked?'text':'password'; };
  $('resetForm').onsubmit=async event=>{
    event.preventDefault();
    const password=$('resetPassword').value;
    if(password!==$('resetConfirm').value)return message('两次输入的新密码不一致',true);
    if(new TextEncoder().encode(password).length>72)return message('密码不能超过72个UTF-8字节，请缩短密码',true);
    $('resetSubmit').disabled=true;
    try {
      const data=await post('/api/auth/password-reset/confirm',{email:$('resetEmail').value.trim(),code:$('resetCode').value.trim(),password});
      ['brand_auth_token','brand_user_name','brand_user_role'].forEach(key=>localStorage.removeItem(key));
      $('resetForm').hidden=true; message(data.message);
    }catch(err){message(err.message,true);$('resetSubmit').disabled=!enabled;}
  };
  fetch('/api/auth/password-reset/status').then(r=>{if(!r.ok)throw new Error('无法读取邮件服务状态');return r.json();}).then(data=>{
    enabled=data.enabled;$('sendCode').disabled=!enabled;$('resetSubmit').disabled=!enabled;
    if(!enabled)message('邮件服务尚未配置，请联系管理员',true);
  }).catch(err=>message(err.message,true));
})();
