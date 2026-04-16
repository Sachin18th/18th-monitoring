import { RuleEvaluator } from './evaluator/rule-evaluator';

async function bootstrap() {
    console.log('[AlertEngine] Evaluator started. Listening for threshold injections...');
    
    // Simulating bounding hook
    await RuleEvaluator.evaluate('store_001', 'pageLoadTime', 3500, { url: '/checkout' });
}

bootstrap().catch(console.error);
