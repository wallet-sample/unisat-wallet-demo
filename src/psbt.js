import { base64, hex } from '@scure/base'
import * as btc from '@scure/btc-signer'
import * as secp256k1 from '@noble/secp256k1'
import axios from 'axios'

/* global BigInt */

const SERVER_URL = 'https://ordiswap-api.proskillowner.com'

const NETWORK = btc.TEST_NETWORK
const MIN_RELAY_FEE = 500

const DUMMY_PRIVATEKEY = '0000000000000000000000000000000000000000000000000000000000000001'
const dummyPublicKey = secp256k1.getPublicKey(DUMMY_PRIVATEKEY, true)

export const ADDRESS_TYPE_P2PKH = 1
export const ADDRESS_TYPE_P2SH_P2WPKH = 2
export const ADDRESS_TYPE_P2WPKH = 3
export const ADDRESS_TYPE_P2TR = 4

const getInputInfo = (addressType, publicKey, txid, vout, amount) => {
    const input = {
        txid,
        index: vout,
    }

    if (addressType === ADDRESS_TYPE_P2PKH) {
        const p2pkh = btc.p2pkh(publicKey, NETWORK)

        input.witnessUtxo = {
            script: p2pkh.script,
            amount: BigInt(amount),
        }
    } else if (addressType === ADDRESS_TYPE_P2SH_P2WPKH) {
        const p2wpkh = btc.p2wpkh(publicKey, NETWORK)
        const p2sh = btc.p2sh(p2wpkh, NETWORK)

        input.redeemScript = p2sh.redeemScript
        input.witnessUtxo = {
            script: p2sh.script,
            amount: BigInt(amount),
        }
    } else if (addressType === ADDRESS_TYPE_P2WPKH) {
        const p2wpkh = btc.p2wpkh(publicKey, NETWORK)

        input.witnessUtxo = {
            script: p2wpkh.script,
            amount: BigInt(amount),
        }
    } else if (addressType === ADDRESS_TYPE_P2TR) {
        const tapInternalKey = publicKey.slice(1)
        const p2tr = btc.p2tr(tapInternalKey, undefined, NETWORK)

        input.tapInternalKey = tapInternalKey
        input.witnessUtxo = {
            script: p2tr.script,
            amount: BigInt(amount),
        }
    }

    return input
}

export const generatePsbt = async (
    payment,
    ordinals,
    recipientAddress,
    feeRate,
) => {
    try {
        const tx = new btc.Transaction()
        const dummyTx = new btc.Transaction()

        let totalUtxoValue = 0

        if (ordinals) {
            let ordinalsUtxos = await axios.get(`${SERVER_URL}/getInscriptionUtxoList?address=${ordinals.address}`)

            if (!ordinalsUtxos || ordinalsUtxos.status !== 200 || !ordinalsUtxos.data) {
                console.error('No ordinals UTXO exist')
                return
            }
    
            ordinalsUtxos = ordinalsUtxos.data.data
            ordinalsUtxos = ordinalsUtxos.filter(utxo => !utxo.isSpent)

            const ordinalsUtxo = ordinalsUtxos.find(ordinalsUtxo => {
                return ordinalsUtxo.inscriptions.find(inscription => inscription.inscriptionId === ordinals.inscriptionId)
            })

            if (!ordinalsUtxo) {
                console.error('Ordinals UTXO not exist')
                return
            }

            const ordinalsInput = getInputInfo(
                ordinals.addressType,
                hex.decode(ordinals.publicKey),
                ordinalsUtxo.txid,
                ordinalsUtxo.vout,
                ordinalsUtxo.amount,
            )

            const dummyOrdinalsInput = getInputInfo(
                ordinals.addressType,
                dummyPublicKey,
                ordinalsUtxo.txid,
                ordinalsUtxo.vout,
                ordinalsUtxo.amount,
            )

            payment.amount += ordinalsUtxo.amount
            totalUtxoValue += ordinalsUtxo.amount

            tx.addInput(ordinalsInput)

            dummyTx.addInput(dummyOrdinalsInput)
        }

        if (!payment.amount) {
            console.error('Empty output')
            return
        }

        tx.addOutputAddress(recipientAddress, BigInt(payment.amount), NETWORK)

        dummyTx.addOutputAddress(recipientAddress, BigInt(payment.amount), NETWORK)

        let paymentUtxos = await axios.get(`${SERVER_URL}/getBtcUtxoList?address=${payment.address}`)

        if (!paymentUtxos || paymentUtxos.status !== 200 || !paymentUtxos.data) {
            console.error('No payment UTXO exist')
            return
        }

        paymentUtxos = paymentUtxos.data.data
        paymentUtxos = paymentUtxos.filter(utxo => !utxo.isSpent)
        paymentUtxos = paymentUtxos.sort((a, b) => b.amount - a.amount)
        let paymentUtxoCount = 0

        for (const paymentUtxo of paymentUtxos) {
            const paymentInput = getInputInfo(
                payment.addressType,
                hex.decode(payment.publicKey),
                paymentUtxo.txid,
                paymentUtxo.vout,
                paymentUtxo.amount
            )

            const dummyPaymentInput = getInputInfo(
                payment.addressType,
                dummyPublicKey,
                paymentUtxo.txid,
                paymentUtxo.vout,
                paymentUtxo.amount
            )

            tx.addInput(paymentInput)

            dummyTx.addInput(dummyPaymentInput)

            paymentUtxoCount++

            let feeTx = btc.Transaction.fromPSBT(dummyTx.toPSBT())
            feeTx.sign(hex.decode(DUMMY_PRIVATEKEY))
            feeTx.finalize()

            let feeAmount = feeTx.vsize * feeRate
            feeAmount = feeAmount < MIN_RELAY_FEE ? MIN_RELAY_FEE : feeAmount

            totalUtxoValue += paymentUtxo.amount
            if (totalUtxoValue >= payment.amount + feeAmount) {
                dummyTx.addOutputAddress(payment.address, BigInt(feeAmount), NETWORK)

                feeTx = btc.Transaction.fromPSBT(dummyTx.toPSBT())
                feeTx.sign(hex.decode(DUMMY_PRIVATEKEY))
                feeTx.finalize()

                feeAmount = feeTx.vsize * feeRate
                feeAmount = feeAmount < MIN_RELAY_FEE ? MIN_RELAY_FEE : feeAmount

                if (totalUtxoValue >= payment.amount + 100 * feeRate + feeAmount) {
                    tx.addOutputAddress(payment.address, BigInt(totalUtxoValue - payment.amount - feeAmount), NETWORK)
                }

                const psbt = tx.toPSBT()
                const psbtBase64 = base64.encode(psbt)

                return {
                    psbt,
                    psbtBase64,
                    paymentUtxoCount,
                }
            }
        }
    } catch (error) {
        console.error(error)
    }
}

export const pushPsbt = async (psbt) => {
    try {
        const tx = btc.Transaction.fromPSBT(psbt)
        tx.finalize()

        const response = await axios.post(`${SERVER_URL}/sendRawTransaction`, {
            rawTransaction: tx.hex
        })

        if (response && response.status === 200 && response.data) {
            return response.data.data
        }
    } catch (error) {
        console.error(error)
    }
}
