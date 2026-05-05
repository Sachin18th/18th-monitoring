import { RuleEvaluator } from './evaluator/rule-evaluator';

async function bootstrap() {
    console.log('[AlertEngine] Evaluator started. Listening for threshold injections...');
    
    // Simulating bounding hook
    await RuleEvaluator.evaluate('store_001', 'pageLoadTime', 3500, { url: '/checkout' });
}

<<<<<<< HEAD
bootstrap().catch(console.error);
=======
bootstrap().catch(console.error);
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
