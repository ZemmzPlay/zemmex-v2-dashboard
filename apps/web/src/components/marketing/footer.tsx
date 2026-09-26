import Link from 'next/link';
import { DemoForm } from './demo-form';

/** The blue footer with the demo request and the oversized wordmark. */
export function MarketingFooter() {
  return (
    <footer className="zft">
      <div className="w">
        <div className="cols">
          <div><h4>Product</h4><Link href="/#how">How it works</Link><Link href="/#pricing">Pricing</Link><Link href="/zemmz-play">zemmz Play for esports</Link><Link href="/help">Help centre</Link><Link href="/signup">Start free trial</Link></div>
          <div><h4>Company</h4><Link href="/contact">Contact us</Link><a href="mailto:hello@zemmz.com">hello@zemmz.com</a></div>
          <div><h4>Legal</h4><Link href="/terms">Terms and conditions</Link><Link href="/privacy">Privacy policy</Link></div>
        </div>
        <DemoForm />
      </div>
      <div className="w legal" style={{ display: 'flex' }}><span>© {new Date().getFullYear()} zemmz</span><span>Prices exclude VAT</span></div>
      <span className="big" role="img" aria-label="zemmz" />
    </footer>
  );
}
