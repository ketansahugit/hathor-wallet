import React from 'react';
import $ from 'jquery';
import tokens from '../utils/tokens';


class ModalAddManyTokens extends React.Component {
  state = { errorMessage: '' };

  componentDidMount = () => {
    $('#addManyTokensModal').on('hide.bs.modal', (e) => {
      this.refs.configs.value = '';
      this.setState({ errorMessage: '' });
    })

    $('#addManyTokensModal').on('shown.bs.modal', (e) => {
      this.refs.configs.focus();
    })
  }

  componentWillUnmount = () => {
    // Removing all event listeners
    $('#addManyTokensModal').off();
  }

  handleAdd = (e) => {
    e.preventDefault();
    const configs = this.refs.configs.value;
    let toAdd = [];
    if (configs === '') {
      this.setState({ errorMessage: 'Must provide configuration string' });
      return;
    }

    const configsArr = configs.split(',');
    for (const config of configsArr) {
      // Preventing when the user forgets a comma in the end
      if (config !== '') {
        const tokenData = tokens.getTokenFromConfigurationString(config);
        if (tokenData === null) {
          this.setState({ errorMessage: `Invalid configuration string: ${config}` });
          return;
        }
        const existedToken = tokens.tokenExists(tokenData.uid);
        if (existedToken) {
          this.setState({ errorMessage: `You already have this token: ${config} (${existedToken.name})` });
          return;
        }
        toAdd.push(tokenData);
      }
    }
    for (const config of toAdd) {
      tokens.addToken(config.uid, config.name, config.symbol);
    }
    this.props.success(toAdd.length);
  }

  render() {
    return (
      <div className="modal fade" id="addManyTokensModal" tabIndex="-1" role="dialog" aria-labelledby="addManyTokensModal" aria-hidden="true">
        <div className="modal-dialog" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="exampleModalLabel">Add many tokens</h5>
              <button type="button" className="close" data-dismiss="modal" aria-label="Close">
                <span aria-hidden="true">&times;</span>
              </button>
            </div>
            <div className="modal-body">
              <p>Write the configuration string for each token separated by comma</p>
              <form ref="formAddToken">
                <div className="form-group">
                  <textarea className="form-control" rows={8} ref="configs" placeholder="Configuration strings separated by comma" />
                </div>
                <div className="row">
                  <div className="col-12 col-sm-10">
                      <p className="error-message text-danger">
                        {this.state.errorMessage}
                      </p>
                  </div>
                </div>
              </form>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" data-dismiss="modal">Cancel</button>
              <button onClick={this.handleAdd} type="button" className="btn btn-hathor">Add</button>
            </div>
          </div>
        </div>
      </div>
    )
  }
}

export default ModalAddManyTokens;