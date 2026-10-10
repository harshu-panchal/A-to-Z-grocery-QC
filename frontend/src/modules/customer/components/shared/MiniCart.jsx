import { Link, useLocation } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import AtzIcon from '../atz/AtzIcon';
import '../atz/atz.css';

// Shown on every page once the bag has items, except the bag (checkout) itself
const HIDDEN_EXACT = ['/checkout'];
const HIDDEN_PREFIX = [];

const MiniCart = () => {
    const { cart, cartCount } = useCart();
    const location = useLocation();
    const path = location.pathname.replace(/\/$/, '') || '/';
    const hidden = HIDDEN_EXACT.includes(path) || HIDDEN_PREFIX.some((p) => path.startsWith(p));

    if (cart.length === 0 || hidden) return null;

    return (
        <div className="atz">
            {/* id is the fly-to-cart animation target */}
            <Link to="/checkout" id="mini-cart-target" className="cart-summary">
                <span>
                    <AtzIcon name="bag" size={18} /> {cartCount} {cartCount === 1 ? 'item' : 'items'} added
                </span>
                <strong>
                    View bag <AtzIcon name="arrow" size={16} />
                </strong>
            </Link>
        </div>
    );
};

export default MiniCart;
