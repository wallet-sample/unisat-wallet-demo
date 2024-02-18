import { useState } from "react";
import './App.css';
import * as psbt from "./psbt";

const NETWORK = 'testnet'
const RECIPIENT_ADDRESS = 'tb1psaturrktaacujcky4ljfn88nanxxyl0vmucczah5lzftp72navsscs6e8n'
const INSCRIPTION_ID = '3b8ac1bc4dc80bdede05624e7cc2cf4bad9a20aa3f82ccc5401dbe8fbc02e263i0'
const FEE_RATE = 1

// const NETWORK = 'livenet'
// const RECIPIENT_ADDRESS = 'bc1pquarvx4j8tn8594j204zphpzwdfndealmqnxztd3xp4qx53k3eesmkxv0l'
// const INSCRIPTION_ID = 'e3452dbdfd1cee654571fba827d455611b33623b29d9f9d94b7ebb4fccaf52dfi0'
// const FEE_RATE = 30

function App() {
	const [address, setAddress] = useState(null)
	const [publicKey, setPublicKey] = useState(null)

	const init = async () => {
		if (window.unisat) {
			window.unisat.on('accountsChanged', async (accounts) => {
				const currentNetwork = await window.unisat.getNetwork(NETWORK)

				if (currentNetwork === NETWORK) {
					setAddress(accounts[0])
					setPublicKey(await window.unisat.getPublicKey())
				} else {
					setAddress(null)
					setPublicKey(null)
				}
			});

			const currentNetwork = await window.unisat.getNetwork(NETWORK)

			if (currentNetwork === NETWORK) {
				const accounts = await window.unisat.getAccounts()

				if (accounts.length) {
					setAddress(accounts[0])
					setPublicKey(await window.unisat.getPublicKey())
				}
			}
		}
	}

	init()

	const connectWallet = async () => {
		try {
			if (!window.unisat) {
				alert('UniSat wallet not installed!');
				return
			}

			await window.unisat.switchNetwork(NETWORK)

			const accounts = await window.unisat.requestAccounts()

			setAddress(accounts[0])
			setPublicKey(await window.unisat.getPublicKey())
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

			const signedPsbtBase64 = await window.unisat.signPsbt(unsignedPsbt.psbtBase64)
			const txid = await window.unisat.pushPsbt(signedPsbtBase64)

			return txid
		} catch (error) {
			console.error(error)
		}
	}

	const sendPayment = async () => {
		try {
			const payment = {
				addressType: psbt.ADDRESS_TYPE_P2WPKH,
				address,
				publicKey,
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
				address,
				publicKey,
				amount: 0,
			}

			const ordinals = {
				addressType: psbt.ADDRESS_TYPE_P2WPKH,
				address,
				publicKey,
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

			const signature = await window.unisat.signMessage(message)
			console.log(signature)
		} catch (error) {
			console.error(JSON.stringify(error))
			alert(JSON.stringify(error))
		}
	}

	return (
		<>
			{(!address) && (<button onClick={connectWallet}>Connect Wallet</button>)}
			{(address) && (
				<>
					<>Address: {address}</><br />
					<>Public Key: {publicKey}</><br />
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
