#!/bin/bash
# Debug script for LLM proxy deployment

echo "=== Checking pod status ==="
kubectl get pods -l app=llm-proxy

echo ""
echo "=== Checking service ==="
kubectl get svc llm-proxy

echo ""
echo "=== Checking ingress ==="
kubectl get ingress llm-proxy-ingress

echo ""
echo "=== Checking recent pod logs ==="
POD=$(kubectl get pods -l app=llm-proxy -o jsonpath='{.items[0].metadata.name}')
if [ -n "$POD" ]; then
    echo "Pod: $POD"
    kubectl logs $POD --tail=50
else
    echo "No pods found!"
fi

echo ""
echo "=== Checking pod events ==="
kubectl get events --field-selector involvedObject.name=$POD --sort-by='.lastTimestamp' | tail -10
