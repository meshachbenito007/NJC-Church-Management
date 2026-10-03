const codes=new Map();
function issueOtp(mobile){const otp=String(Math.floor(100000+Math.random()*900000));codes.set(mobile,{otp,expires:Date.now()+5*60*1000});console.log(`[DEV OTP] ${mobile}: ${otp}`);return otp}
function verifyOtp(mobile,otp){const x=codes.get(mobile);if(!x||x.expires<Date.now()||x.otp!==String(otp))return false;codes.delete(mobile);return true}
module.exports={issueOtp,verifyOtp};
