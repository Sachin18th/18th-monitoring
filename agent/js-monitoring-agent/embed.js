// Minimalistic IIFE integrating tracking logic externally wrapped out seamlessly isolating domains natively
(function() {
    var script = document.createElement('script');
    script.src = 'https://cdn.example-telemetry.com/kpi-agent.min.js';
    script.async = true;
    script.onload = function() {
        if (window.KpiAgent) {
            window.KpiAgent.init({
                siteId: 'store_001',
                endpoint: 'https://api.yourbrand.com'
            });
        }
    };
    document.head.appendChild(script);
<<<<<<< HEAD
})();
=======
})();
>>>>>>> dc8ac95f2b4e1fe67c5b24cfb539e5ac10164acb
