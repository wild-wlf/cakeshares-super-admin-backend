#!/bin/bash

# List of folders
folders=("admin" "user" "products" 'notifications')

# Loop through each folder and install Node modules
for folder in "${folders[@]}"
do
    echo "Installing Node modules in $folder..."
    cd "$folder" || exit 1
    npm install
    cd ..
done

echo "Node module installation complete."
