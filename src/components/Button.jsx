import React from 'react';
import './Button.css';

const Button = ({ children, variant = 'primary', as, className = '', ...props }) => {
    const Component = as || 'button';
    return (
        <Component className={`btn btn-${variant} ${className}`} {...props}>
            {children}
        </Component>
    );
};

export default Button;
