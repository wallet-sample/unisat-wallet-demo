import { useState } from "react";
import './App.css';
import * as psbt from "./psbt";

// const RECIPIENT_ADDRESS = 'tb1q8gqpqkavur3kp93kuvea4mv9tcj0cahltalf9r'
// const INSCRIPTION_ID = 'e3452dbdfd1cee654571fba827d455611b33623b29d9f9d94b7ebb4fccaf52dfi0'
// const FEE_RATE = 1

const RECIPIENT_ADDRESS = 'bc1qeaacuf2d7anrdrcez02mn0lh2zfhscy9c3f0na'
const INSCRIPTION_ID = '568efc6ba7908f90908fcf2af243996f361dad3a11ae2d1401c9d845efd81720i0'
const FEE_RATE = 30

function App() {
	const [walletConnected, setWalletConnection] = useState(false)
	const [paymentAccount, setPaymentAccount] = useState(null)
	const [ordinalsAccount, setOrdinalsAccount] = useState(null)

	const setAccounts = (accounts) => {
		if (accounts) {
			setWalletConnection(true)
			for (const account of accounts) {
				if (account.purpose === 'payment') {
					setPaymentAccount(account)
				} else if (account.purpose === 'ordinals') {
					setOrdinalsAccount(account)
				}
			}
		} else {
			setWalletConnection(false)
			setPaymentAccount(null)
			setOrdinalsAccount(null)
		}
	}

	const init = async () => {
		if (window.phantom && window.phantom.bitcoin && window.phantom.bitcoin.isPhantom) {
			window.phantom.bitcoin.on('accountsChanged', async (accounts) => {
				if (accounts.length > 0) {
					setAccounts(accounts)
				} else {
					setAccounts(null)
				}
			})
		}
	}

	init()

	const connectWallet = async () => {
		try {
			if (!window.phantom) {
				alert('Phantom wallet not installed');
				return
			}

			if (!window.phantom.bitcoin || !window.phantom.bitcoin.isPhantom) {
				alert('Bitcoin account not available');
				return
			}

			const accounts = await window.phantom.bitcoin.requestAccounts()
			setAccounts(accounts)
		} catch (error) {
			console.error(JSON.stringify(error))
			alert(JSON.stringify(error))
		}
	}

	const signPsbt = async (payment, ordinals, recipientAddress, feeRate) => {
		try {
			const unsignedPsbt = await psbt.generatePsbt(
				payment,
				ordinals,
				recipientAddress,
				feeRate,
			)

			if (!unsignedPsbt) {
				console.error('Invalid PSBT')
				return
			}

			const inputsToSign = []

			if (ordinals) {
				inputsToSign.push({
					address: ordinals.address,
					signingIndexes: [0],
					sigHash: 0,
				})
			}

			for (let i = 0; i < unsignedPsbt.paymentUtxoCount; i++) {
				inputsToSign.push({
					address: payment.address,
					signingIndexes: [i + ordinals ? 1 : 0],
					sigHash: 0,
				})
			}

			const signedPsbt = await window.phantom.bitcoin.signPSBT(unsignedPsbt.psbt, { inputsToSign })
			const txid = await psbt.pushPsbt(signedPsbt)

			return txid
		} catch (error) {
			console.error(error)
		}
	}

	const sendPayment = async () => {
		try {
			const payment = {
				addressType: psbt.ADDRESS_TYPE_P2WPKH,
				address: paymentAccount.address,
				publicKey: paymentAccount.publicKey,
				amount: 1000,
			}

			const txid = await signPsbt(payment, null, RECIPIENT_ADDRESS, FEE_RATE)

			if (txid) {
				console.log(txid)
			} else {
				alert('Error')
			}
		} catch (error) {
			console.error(JSON.stringify(error))
			alert(JSON.stringify(error))
		}
	}

	const sendOrdinals = async () => {
		try {
			const payment = {
				addressType: psbt.ADDRESS_TYPE_P2WPKH,
				address: paymentAccount.address,
				publicKey: paymentAccount.publicKey,
				amount: 0,
			}

			const ordinals = {
				addressType: psbt.ADDRESS_TYPE_P2TR,
				address: ordinalsAccount.address,
				publicKey: ordinalsAccount.publicKey,
				inscriptionId: INSCRIPTION_ID,
			}

			const txid = await signPsbt(payment, ordinals, RECIPIENT_ADDRESS, FEE_RATE)

			if (txid) {
				console.log(txid)
			} else {
				alert('Error')
			}
		} catch (error) {
			console.error(JSON.stringify(error))
			alert(JSON.stringify(error))
		}
	}

	const signMessage = async () => {
		try {
			const message = 'Hello World'
			const messageBytes = new TextEncoder().encode(message)
			const signature = await window.phantom.bitcoin.signMessage(paymentAccount.address, messageBytes)
			console.log(signature)
		} catch (error) {
			console.log(JSON.stringify(error));
			alert(JSON.stringify(error))
		}
	}

	return (
		<>
			{(!walletConnected) && (<button onClick={connectWallet}>Connect Wallet</button>)}
			{(walletConnected) && (
				<>
					<>Payment</><br />
					<>Address: {paymentAccount.address}</><br />
					<>Public Key: {paymentAccount.publicKey}</><br />
					<>Address Type: {paymentAccount.addressType}</><br />
					<>Purpose: {paymentAccount.purpose}</><br />
					<br />
					<>Ordinals</><br />
					<>Address: {ordinalsAccount.address}</><br />
					<>Public Key: {ordinalsAccount.publicKey}</><br />
					<>Address Type: {ordinalsAccount.addressType}</><br />
					<>Purpose: {ordinalsAccount.purpose}</><br />
					<br />
					<button onClick={sendPayment} >Send Payment</button>
					<button onClick={sendOrdinals} >Send Ordinals</button>
					<button onClick={signMessage} >Sign Message</button>
				</>
			)}
		</>
	);
}

export default App;
