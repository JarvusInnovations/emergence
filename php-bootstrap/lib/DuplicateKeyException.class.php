<?php

class DuplicateKeyException extends Exception
{
    private $duplicateKey;
    private $duplicateValue;

    public function __construct($message, $code = 0, Exception $previous = null) {

        if (preg_match('/Duplicate entry \'(?<value>[^\']+)\' for key \'(?<key>[^\']+)\'/', $message, $matches)) {
            $this->duplicateKey = $matches['key'];
            $this->duplicateValue = $matches['value'];
        }

        parent::__construct($message, $code, $previous);
    }

    public function getDuplicateKey()
    {
        return $this->duplicateKey;
    }

    public function getDuplicateValue()
    {
        return $this->duplicateValue;
    }
}