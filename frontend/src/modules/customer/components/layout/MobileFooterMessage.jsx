import AtzIcon from '../atz/AtzIcon';
import '../atz/atz.css';

const MobileFooterMessage = () => (
    <div className="atz md:hidden">
        <footer className="footer">
            <p>
                India’s last
                <br />
                minute app
                <span className="footer-heart">
                    <AtzIcon name="heart" size={32} />
                </span>
            </p>
            <span>© A to Z Grocery</span>
        </footer>
        {/* room for the fixed bottom nav */}
        <div className="footer-spacer" />
    </div>
);

export default MobileFooterMessage;
