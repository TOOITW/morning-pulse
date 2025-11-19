import 'dotenv/config';
import { buildAndSendNewsletter } from '../../apps/web/src/lib/services/newsletter-builder';

async function main() {
  try {
    const result = await buildAndSendNewsletter();

    console.log('✅ Newsletter built and (attempted) sent.');
    console.log(
      JSON.stringify(
        {
          issueId: result.issueId,
          recipientCount: result.recipientCount,
          successCount: result.successCount,
          failureCount: result.failureCount,
          articlesIncluded: result.articlesIncluded,
        },
        null,
        2
      )
    );
  } catch (err) {
    console.error('❌ Failed to build/send newsletter:', err);
    process.exit(1);
  }
}

main();
