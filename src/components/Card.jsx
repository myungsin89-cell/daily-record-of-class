import React from 'react';
import './Card.css';

const Card = ({ title, children, className = '', style, ...props }) => {
    return (
        <div className={`card ${className}`} style={style} {...props}>
            {title && <h3 className="card-title">{title}</h3>}
            <div className="card-body">{children}</div>
        </div>
    );
};

export default Card;
