import React from 'react';
import logo from '../assets/images/hathor-logo.png';
import BackButton from '../components/BackButton';


/**
 * Screen that shows 404 error message to the user
 *
 * @memberof Screens
 */
const Page404 = (props) => {
  return (
    <div className="outside-content-wrapper">
      <div className="inside-white-wrapper col-sm-12 col-md-8 offset-md-2 col-lg-6 offset-lg-3">
        <BackButton {...props} />
        <div>
          <div className="d-flex align-items-center flex-column">
            <img className="hathor-logo" src={logo} alt="" />
            <h2 className="mt-5 mb-4"><strong>Page not found</strong></h2>
          </div>
          <p className="mb-4">You tried to access a page that does not exist in Hathor Wallet</p>
        </div>
      </div>
    </div>
  );
}

export default Page404;