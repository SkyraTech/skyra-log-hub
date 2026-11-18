import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AuthController} from '../../src/modules/auth/api/auth.controller.js';
import {BffConfigService} from '../../src/config/bff-config.service.js';
test('login return paths reject URL normalization and control-character open redirects',async()=>{
  let captured:string|undefined;
  const oidc={createProviderAuthorizationRequest:async(value?:string)=>{captured=value;return {authorizationUrl:'https://provider.test.invalid/authorize',state:'test-state'};}};
  const controller=new AuthController(new BffConfigService(),oidc as any,{} as any,{} as any,{} as any);
  const reply={setCookie:()=>{},send:()=>{}} as any;
  for(const path of ['//attacker.test.invalid','/\\attacker.test.invalid','/\t/attacker.test.invalid','/\n/attacker.test.invalid','https://attacker.test.invalid','/raw space']){
    await controller.login(path,'false',reply);assert.equal(captured,'/');
  }
  await controller.login('/organization/settings?tab=general','false',reply);assert.equal(captured,'/organization/settings?tab=general');
});
