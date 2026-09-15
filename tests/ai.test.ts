import {test} from 'node:test';
import assert from 'node:assert/strict';
import {providerKey,checkKeyProvider,aiError,providers} from '../lib/ai-providers';
test('provider credentials cannot silently follow a switch to another vendor',()=>{
 assert.equal(providerKey({ai:'gsk_legacy'},'groq'),'gsk_legacy');assert.equal(providerKey({ai:'gsk_legacy'},'deepseek'),'');
 assert.equal(providerKey({ai_groq:'old-key',ai_openrouter:'new-key'},'openrouter'),'new-key');
 assert.ok(checkKeyProvider('gsk_test','openrouter'));assert.equal(checkKeyProvider('sk-or-test','openrouter'),'');
 assert.equal(providers.openrouter.model,'openrouter/free');assert.match(aiError(402,'','DeepSeek'),/credits/);
});
